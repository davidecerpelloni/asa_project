const { exec } = require('child_process');
const { writeFile } = require('fs');
const { promisify } = require('util');

class PddlPlanner {
    constructor(environment) {
        this._domain_path = "src/domain.pddl";
        this._problem_path = "src/problem.pddl";
        this._beliefs = environment;
    }

    async getPlan(agentPosition, agentDestination) {
        const tmpProblem = this._toPDDL();

        const agents = [];
        /*
        for (const agent of this._beliefs.getAgents(true, false)) {
            agents.push(`(agentAt t_${agent.position.row}_${agent.position.column})`);
        }
        tmpProblem.addInitPredicate(agents.join(" "));
        */
        tmpProblem.addInitPredicate(`(at t_${agentPosition.row}_${agentPosition.column})`);

        tmpProblem.addGoalPredicate(`(at t_${agentDestination.row}_${agentDestination.column})`);

        await tmpProblem.toFile(this._problem_path);
        const plan = await this._runSolver();
        return this._parsePlan(plan);
    }

    async _runSolver() {
        const command = `planutils run ff ${this._domain_path} ${this._problem_path}`;
        const execAsync = promisify(exec);
        const result = await execAsync(command);
        if (result.stderr) {
            throw new Error(result.stderr);
        }
        return result.stdout;
    }

    _toPDDL() {
        const envTiles = [...this._beliefs.map.tiles];
        const tiles = envTiles.map((tile) => `t_${tile.position.row}_${tile.position.column}`);
        tiles.push("- tile");

        const neighbours = [];
        for (const tile of envTiles) {
            for (const neighbour of this._beliefs.map.adjacent(tile.position)) {
                const nextDirection = tile.position.directionTo(neighbour);
                neighbours.push(
                    `(${nextDirection} t_${tile.position.row}_${tile.position.column} t_${neighbour.row}_${neighbour.column})`
                );
            }
        }

        return new PDDLProblem(tiles, neighbours, [""]);
    }

    _parsePlan(plan) {
        const planArray = plan.toLowerCase().split("\n");
        const startIndex = searchStringInArray("step", planArray);
        const endIndex = searchStringInArray("time spent", planArray) - 2;
        if (startIndex === -1 || endIndex === -1) {
            return [];
        }

        const directions = planArray.slice(startIndex, endIndex).map((line) => {
            const lineTrim = line.trim();
            const line_array = lineTrim.split(" ").splice(-3);
            if (line_array[0] === "up") {
                return "UP";
            }
            if (line_array[0] === "down") {
                return "DOWN";
            }
            if (line_array[0] === "left") {
                return "LEFT";
            }
            if (line_array[0] === "right") {
                return "RIGHT";
            }
            throw new Error("Invalid direction");
        });
        if (directions.length === 0) {
            return null;
        }
        return directions;
    }
}

class PDDLProblem {
    constructor(objects, init, goal) {
        this._objects = objects;
        this._init = init;
        this._goal = goal;
    }

    toPDDLString() {
        return `(define (problem problem1)
        (:domain deliveroo)
        (:objects ${this._objects.join(" ").trim()})
        (:init ${this._init.join(" ").trim()})
        (:goal (and ${this._goal.join(" ").trim()}))
        )`;
    }

    addInitPredicate(predicate) {
        this._init.push(predicate);
    }

    addGoalPredicate(predicate) {
        this._goal.push(predicate);
    }

    async toFile(path) {
        return new Promise((resolve, reject) => {
            writeFile(path, this.toPDDLString(), (err) => {
                if (err) {
                    reject(err);
                }
                resolve();
            });
        });
    }
}

///////////////////////////////////////////////
// Helper functions
///////////////////////////////////////////////

function searchStringInArray(str, strArray) {
    for (let j = 0; j < strArray.length; j += 1) {
        if (strArray[j].match(str)) return j;
    }
    return -1;
}


