import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";
import { PddlDomain, PddlAction, PddlProblem, PddlExecutor, onlineSolver, Beliefset } from "@unitn-asa/pddl-client";
import fs from 'fs';

//cristavida

// creation of the client object
const client = new DeliverooApi(
    //'https://deliveroojs2.onrender.com',
    'http://localhost:8080',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjdiMDRmNjk2NmM5IiwibmFtZSI6ImNyaXN0YXZpZGEiLCJpYXQiOjE3MjA2ODIwMDN9.w1u7zCwsnmcHKSrm6joQKQi_6ZBg41VbRblF507cpwo'
)

// Function to read the domain PDDL file
function readFile ( path ) {
    
    return new Promise( (res, rej) => {

        fs.readFile( path, 'utf8', (err, data) => {
            if (err) rej(err)
            else res(data)
        })

    })

}

// Function to calculate the Manhattan distance between two points 
// that are represented as objects with x and y properties
function distance( {x:x1, y:y1}, {x:x2, y:y2}) {
    const dx = Math.abs( Math.round(x1) - Math.round(x2) )
    const dy = Math.abs( Math.round(y1) - Math.round(y2) )
    return dx + dy;
}

// Function to calculate the Manhattan distance between two nodes
// Each node is represented as a string with the format 'x|y'
function distanceString(node1, node2){
    const coordinate1 = node1.split("|");
    const coordinate2 = node2.split("|");
    const dx = Math.abs( Math.round(coordinate1[0]) - Math.round(coordinate2[0]) )
    const dy = Math.abs( Math.round(coordinate1[1]) - Math.round(coordinate2[1]) )
    return dx + dy;
}
// Function to convert a node to a point object
function stringToCoordinate(node){
    return node.split("|");
}

// Verify if the x and y coordinates of intention1 and intention2 are equal
function areIntentionsEqual(intention1, intention2) {
    return intention1.x === intention2.x && intention1.y === intention2.y;
}

//Implementation of the message passing system
const parcel_timers = new Map(); //contain map <id_parcel, last_time_detection>
let broadcast_id = true; //if true, the agent will broadcast its id to be recognized by the partner
let GoalReachingCoordinate = {x : -1, y : -1} //coordinate of the goal that the agent is trying to reach


// class that represents my map: it contain:
// - the dimension of the map
// - the matrix of the map
// - the delivery tiles
// - the spawner tiles
class MyMap {
    #dimX
    #dimY
    #matrixTiles
    #deliveryTiles
    #spawnerTiles
    getDimension(){
        return [this.#dimX, this.#dimY]
    }

    getMatrix(){
        return this.#matrixTiles
    }
    getDelivery(){
        return this.#deliveryTiles
    }
    getSpawner(){
        return this.#spawnerTiles
    }
    // function that returns the neighbours of a tile
    getNeighbours(x, y){
        const array = []
        if (this.#matrixTiles[x - 1] !== undefined && this.#matrixTiles[x - 1][y] !== undefined && this.#matrixTiles[x-1][y]!=0) {
            array.push((x-1) +'|'+ y);
        }
        if (this.#matrixTiles[x + 1] !== undefined && this.#matrixTiles[x + 1][y] !== undefined && this.#matrixTiles[x+1][y]!=0) {
            array.push((x+1) +'|'+ y);
        }
        if (this.#matrixTiles[x][y - 1] !== undefined && this.#matrixTiles[x][y-1]!=0) {
            array.push(x +'|'+ (y-1));
        }
        if (this.#matrixTiles[x][y + 1] !== undefined && this.#matrixTiles[x][y+1]!=0) {
            array.push(x +'|'+ (y+1));
        }
        return array
    }

    getValue(x, y){
        return this.#matrixTiles[x][y]
    }

    constructor (x, y, arrayTiles) {
        this.#dimX = x;
        this.#dimY = y;
        this.#matrixTiles = Array.from({ length: this.#dimX }, () => Array(this.#dimY).fill(0));
        this.#deliveryTiles = []
        this.#spawnerTiles = []
        for (const tile of arrayTiles) {
            let temp = 0
            if (tile.delivery){
                temp = 2
                this.#deliveryTiles.push(tile.x+'|'+tile.y)
            } else if (!tile.delivery && tile.parcelSpawner){
                temp = 1
                this.#spawnerTiles.push(tile.x+'|'+tile.y)
            } else if (!tile.delivery && !tile.parcelSpawner){
                temp = 3
            }
            this.#matrixTiles[tile.x][tile.y] = temp
        }
        //return this.#matrixTiles
    }
}


// class that represents the Directed Acyclic Graph (DAG) of the map
// it contains a map that has as key the node of the map and as value the neighbours of that node
// this dag is used in order to have a more efficient path finding algorithm (A*)
class Dag{
    #dag

    constructor (map){
        this.#dag = new Map()
        this.initializeDag(map)
    }
    // function that initializes the DAG
    initializeDag(map){
        for(var i = 0; i < map.getDimension()[0]; i++){
            for (var j = 0; j<map.getDimension()[1]; j++){
                if (map.getValue(i,j) != 0){
                    this.#dag.set((i+'|'+j), map.getNeighbours(i,j))
                }
            }
        }
    }
    // function that returns the neighbours of a node
    getNeighbours(string){
        return this.#dag.get(string)
    }
}

let myMap = {};
let myDag = {};

// populate myMap and myDag with the information about the grid
client.onMap( (x, y, deliveryMap) => {
    myMap = new MyMap(x, y, deliveryMap);
    myDag = new Dag(myMap);
})

// function that returns the path from the start node to the goal node
function aStarPath (dag, start, goal){
    const frontier = []
    const explored = []
    //creation of the node class that contains the information about the node
    class Node{
        node_name
        pathCost
        heuristic
        completeDistance
        parent
        constructor(node_name, parent, pathCost, heuristic){
            this.node_name = node_name
            this.parent = parent
            this.pathCost = pathCost
            this.heuristic = heuristic
            this.completeDistance = pathCost + heuristic
        }
    }
    // function that returns the index of a node in an array
    function indexInArray(node, array){
        return array.findIndex((element) => element.node_name == node.node_name)
    }
    // function that returns the solution of the A* algorithm
    function solution(node){
        const array=[]
        while(node != null){
            array.push(node.node_name)
            node = node.parent
        }
        return array.reverse()
    }
    // check if the start and goal nodes are valid (for example 15.4|5.6 is not valid)
    if(start.includes(".") || goal.includes(".")){
        return []
    }
    // add the start node to the frontier
    frontier.push(new Node(start, null, 0, distanceString(start, goal)))
    // while the frontier is not empty
    while (frontier.length !== 0) {
        // sort the frontier based on the complete distance of the nodes
        frontier.sort((a, b) => a.completeDistance - b.completeDistance);
        // get the node with the lowest complete distance
        const lowestCostNode = frontier.shift();
        if (lowestCostNode.node_name === goal) {
            return solution(lowestCostNode);
        }
        // add the node to the explored set
        explored.push(lowestCostNode);
        // get the neighbours of the node
        const neighbours = dag.getNeighbours(lowestCostNode.node_name);
        // for each neighbour of the node create a new node and add it to the frontier
        for (const childName of neighbours) {
            const childNode = new Node(childName,
                lowestCostNode,
                lowestCostNode.pathCost + 1,
                distanceString(childName, goal));
            const indexExplored = indexInArray(childNode, explored);
            const indexFrontier = indexInArray(childNode, frontier);
            if (indexExplored === -1 && indexFrontier === -1) {
                frontier.push(childNode);
            } else if (indexFrontier !== -1 && frontier[indexFrontier].completeDistance > childNode.completeDistance) {
                frontier[indexFrontier] = childNode;
            }
        }
    }

    return [];

}

// variable that contains my information (id, name, x, y, score)
const me = {};

// callback function that is called when the agent receives the information about itself
client.onYou( ( {id, name, x, y, score} ) => {
    me.id = id
    me.name = name
    me.x = x
    me.y = y
    me.score = score
})

// map that contains the parcels that are detected by the agent 
// and the one that sensed by our partner 
const parcels = new Map();
// map that contains the parcels that are carried by the agent
let carriedByMe = new Map()

//function that reset the parcels that are carried by the agent
//when the agent delivers them
async function modifyGlobalVariables(){
    carriedByMe = new Map()
}

//function used to create the plan in order to reach a certain position
//return a list of action that the agent has to do in order to reach the goal
// or an empty list if the agent cannot reach the goal
async function createPddlProblem(x,y){
    let goal = 'at ' + me.name + ' ' + 't' + x + '_' + y;

        // Create the PDDL problem
        var pddlProblem = new PddlProblem(
            'deliveroo',
            myBeliefset.objects.join(' ') + ' ' + me.name,
            myBeliefset.toPddlString() + ' ' + '(me ' + me.name + ')' + '(at ' + me.name + ' ' + 't' + me.x + '_' + me.y + ')',
            goal
        );

        let problem = pddlProblem.toPddlString();
        // Get the plan from the online solver
        var plan = await onlineSolver(domain, problem);
    
    return plan
}

// parameters of the eviroment
let parameters = null
client.onConfig( (param) => {
    parameters = param
    console.log("PARAMS:",parameters);
} )

// variable that contain the date of the last parcel sensing
let last_parcel_sensing = Date.now();
const blacklisted_parcels = new Map();  // the ones we don't want to pick up anymore
let shout_timer = Date.now();

// callback function that is called when the agent receives the information about the parcels
// that are detected by the agent
// This fuction is used in order to save the parcels that are detected by the agent,
// to send the information about the parcels to the partner and
// to delete the parcels that are not detected anymore from the map after the decading interval
client.onParcelsSensing( async ( perceived_parcels ) => {

    for (const p of perceived_parcels) {
        parcel_timers.set(p.id, Date.now());
        parcels.set(p.id, p);
    }

    // if in parcel_timers parcels were not seen in along time, then delete them
    for (const [p_id, time] of parcel_timers.entries()){
        if (Date.now() - time >= 2 * parseInt(parameters['PARCEL_DECADING_INTERVAL'])*parameters['PARCEL_REWARD_AVG']){
            parcels.delete(p_id);
            parcel_timers.delete(p_id);
            blacklisted_parcels.delete(p_id);
        }
    }

} )

// variable that contiains the beliefset of the agent for the PDDL problem
var myBeliefset = new Beliefset();
// populate the beliefset with the information about the map
client.onMap((width, height, tiles) => {
    for (let { x, y, delivery } of tiles) {
        myBeliefset.declare('tile ' + 't' + x + '_' + y);
        if (delivery) {
            myBeliefset.declare('delivery ' + 't' + x + '_' + y);
        }

        // Find the tile to the right
        let right = tiles.find(tile => tile.x === x + 1 && tile.y === y);
        if (right) {
            myBeliefset.declare('right ' + 't' + x + '_' + y + ' ' + 't' + right.x + '_' + right.y);
        }

        // Find the tile to the left
        let left = tiles.find(tile => tile.x === x - 1 && tile.y === y);
        if (left) {
            myBeliefset.declare('left ' + 't' + x + '_' + y + ' ' + 't' + left.x + '_' + left.y);
        }

        // Find the tile above
        let up = tiles.find(tile => tile.x === x && tile.y === y - 1);
        if (up) {
            myBeliefset.declare('up ' + 't' + x + '_' + y + ' ' + 't' + up.x + '_' + up.y);
        }

        // Find the tile below
        let down = tiles.find(tile => tile.x === x && tile.y === y + 1);
        if (down) {
            myBeliefset.declare('down ' + 't' + x + '_' + y + ' ' + 't' + down.x + '_' + down.y);
        }
    }
});

//function that find the nearest delivery tile from the node object
function findNearestDelivery(map, object){
    let distance = Number.MAX_VALUE
    let node = null
    for(const pos of map.getDelivery()){
        const dist2me = distanceString(Math.trunc(object.x)+'|'+Math.trunc(object.y), pos)
        if (dist2me<distance){
            distance = dist2me
            node = pos
        }
    }
    return node
}


//function that find the furthest delivery tile from the node object
function findFurthestDelivery(map, object){
    let distance = Number.MIN_VALUE
    let node = null
    for(const pos of map.getDelivery()){
        const dist2me = aStarPathModified(myDag,Math.trunc(object.x)+'|'+Math.trunc(object.y),pos).length
        
        if (dist2me>distance && dist2me > 0){
            distance = dist2me
            node = pos
        }
    }
    return node
}

//function that find the furthest spawner tile from the node object
function findFurthestTile(map, object){
    let distance = Number.MIN_VALUE
    let node = null
    for(const pos of map.getSpawner()){
        const dist2me = aStarPathModified(myDag,Math.trunc(object.x)+'|'+Math.trunc(object.y),pos).length
        
        if (dist2me>distance && dist2me > 0){
            distance = dist2me
            node = pos
        }
    }
    return node
}

// fuction used in order to select our desired action
// (We call 2 times the method onParcelsSensing in order to have a clearer code;
// the first time is used to populate the parcels, the second time is used to select the action)
client.onParcelsSensing( parcels => {
    // select the valid action and update the carriedByMe map
    const options = []
    let score = 0
    for (const parcel of parcels.values()){
        if ( ! parcel.carriedBy ){
            options.push( [ 'go_pick_up', parcel.x, parcel.y, parcel.id ] );
        }else if(parcel.carriedBy == me.id){
            score = score + parcel.reward
            carriedByMe.set(parcel.id, parcel.reward)
        }
    }
    //reset the carriedByMe map if the score is negative or 0
    if (score <= 0){
        carriedByMe = new Map()
    }
    // if the agent have parcels to deliver, then add the delivery action to the queue
    if (carriedByMe.size != 0){
        const coordinate = stringToCoordinate(findNearestDelivery(myMap, me))
        myAgent.removeDelivery()
        myAgent.push( ['delivery', coordinate[0], coordinate[1]])
    // if the agent doesn't have options (go_pick_up) and the carriedByMe map is empty,
    // then the agent will go to the furthest spawner tile
    }else if(options.length==0 && carriedByMe.size == 0){
        if (myMap.getMatrix() == []) {
            console.log("myMap is empty. Cannot calculate coordinates.");
            // Handle the case where myMap is empty, e.g., by returning early or providing default coordinates
        } else {
            const coordinate = stringToCoordinate(findFurthestTile(myMap, me));
            // myAgent.removeGoTo(); // Uncomment if necessary and if the method exists
            myAgent.push(['go_to', coordinate[0], coordinate[1]]);
        }
    }
    // if the agent have options (go_pick_up) then select the best option and add it to the queue
    let best_option;
    let nearest = Number.MAX_VALUE;
    for (const option of options) {
        if ( option[0] == 'go_pick_up' ) {
            let [go_pick_up,x,y,id] = option;
            let current_d = distance( {x, y}, me )
            if ( current_d < nearest ) {
                best_option = option
                nearest = current_d
            }
        }
    }
    if ( best_option )
        myAgent.push( best_option )

} )

// All the agent that are detected by the agent with their information
let agentDetected = new Map();
// variable that contains the date of the last agent sending
let agent_timer = Date.now();
client.onAgentsSensing( (agents) =>{
    // update the agentDetected map
    for(const agent of agents){  
        agent.countSeen = -1;
        agentDetected.set(agent.id, agent);
    }
    // if the agent is not detected anymore update the counter of the agent
    for(const agent of agentDetected.values()){  
        if( agent.countSeen < 60){
            agent.countSeen =  agent.countSeen + 1;
            agentDetected.set(agent.id, agent);
        }
    }

} )

// Position x and y of the last intention 
let lastIntention = {x : -1, y : -1}

// class that represents the intention revision
class IntentionRevision {

    #intention_queue = new Array();
    get intention_queue () {
        return this.#intention_queue;
    }
    // method that removes the delivery action from the queue
    removeDelivery (){
        this.#intention_queue = this.#intention_queue.filter((elem) => elem.predicate[0] != 'delivery')
    }
    // method that removes the go_to action from the queue
    removeGoTo(){
        this.#intention_queue = this.#intention_queue.filter((elem) => elem.predicate[0] != 'go_to')
    }

    set intention_queue ( new_queue ) {
        this.#intention_queue = new_queue;
    }

    async loop ( ) {
        while ( true ) {    
            
            // Consumes intention_queue if not empty
            if ( this.intention_queue.length > 0 ) {
                console.log( 'intentionRevision.loop', this.intention_queue.map(i=>i.predicate) );
                
                // Current intention
                const intention = this.intention_queue[0];
                
                // Is queued intention still valid? Do I still want to achieve it?
                let x = intention.predicate[1]
                let y = intention.predicate[2]

                // Check if my partner is nearer than me wrt the goal
                if(intention.predicate[0] == 'go_pick_up'){
                    let id = intention.predicate[3]
                    let p = parcels.get(id)
                    if ( p && p.carriedBy ) {
                        console.log( 'Skipping intention because no more valid', intention.predicate )
                        continue;
                    }

                    if (blacklisted_parcels.get(id) != undefined){
                        continue; 
                    }
                
                }

                GoalReachingCoordinate.x = x
                GoalReachingCoordinate.y = y
                // Start achieving intention
                await intention.achieve()
                // Catch eventual error and continue
                .catch( error => {

                } );

                // Remove intention from queue
                this.#intention_queue = this.#intention_queue.filter((elem) => elem.predicate.join(' ') != intention.predicate.join(' '))
                see_queue(this.intention_queue)
            }
            // Postpone next iteration at setImmediate
            await new Promise( res => setImmediate( res ) );
        }
    }

    // async push ( predicate ) { }

    log ( ...args ) {
        console.log( ...args )
    }

}


function see_queue(queue){
    console.log('\x1b[36m%s\x1b[0m', "Start Queue Intention")
    for(const elem of queue){
        console.log("Intention:",elem.predicate, elem.parent, "Utility: ", UtilityFunction(elem.predicate, elem.parent))
    }
    console.log('\x1b[36m%s\x1b[0m', "End Queue Intention")
}

// Class that extends the IntentionRevision class and that is used in order to 
// order the intentions based on the utility function
// and to stop the current intention if the new intention is different from the current one
class IntentionRevisionRevise extends IntentionRevision {
    async push ( predicate ) {
        // Check if already queued
        var is_present = false
        var is_present_go_to = false
        if(this.intention_queue.length > 0){
            for(const elem of this.intention_queue){
                if(elem.predicate.join(' ') == predicate.join(' ')){
                    is_present = true
                }
                if(elem.predicate[0] == 'go_to'){
                    is_present_go_to = true
                }
            }
        }
        // first element of the queue (the one that is being executed)
        const first = this.intention_queue[0]; 

        // Check if the intention is not already queued
        if(is_present == false) {
            const intention = new Intention( this, predicate );
            //push the intention in the queue
            this.intention_queue.push( intention );
        }
        // Order the intentions queue based on the utility function
        // and remove the intentions with utility function <= 0
        if(me.x % 1 == 0 && me.y % 1 == 0){
            this.intention_queue.sort((a, b) => UtilityFunction(b.predicate, b.parent) - UtilityFunction(a.predicate, a.parent))
            this.intention_queue = this.intention_queue.filter(item => { return UtilityFunction(item.predicate, item.parent) > 0; });
            see_queue(this.intention_queue)
        }
        // first element of the queue ordered
        const first2 = this.intention_queue[0];
        if (first & first2){
            console.log(first.predicate.join(' '), first2.predicate.join(' ')) //perché undefinded first ae first 2?
        }
        // Force current intention stop in order to start the new one (if the new intention is different from the current one)
        if ( first && first2 && first.predicate.join(' ') != first2.predicate.join(' ') ) {
            first.stop();
        }
    }

}



// function that calculate the utility function of a predicate
function UtilityFunction(predicate, parent){
    const action = predicate[0]
    const x = predicate[1]
    const y = predicate[2]
    let score = 0

    // decading interval = movement duration / parcel decading interval
    let decading_interval = (parameters['MOVEMENT_DURATION']/1000)
    if (parameters['PARCEL_DECADING_INTERVAL'] != 'infinite'){
        decading_interval = decading_interval / parseInt(parameters['PARCEL_DECADING_INTERVAL'])
    }else{
        decading_interval = 0
    }
    // calculate the score of the predicate based on the parcel that are carried by the agent
    let scorePackageCarriedByMe = 0
    for (const [,s] of carriedByMe) {
        scorePackageCarriedByMe = scorePackageCarriedByMe + s; // points that myAgent have 
    }
    score = scorePackageCarriedByMe - (carriedByMe.size * aStarPathModified(myDag, me.x+'|'+me.y, x+'|'+y).length * decading_interval)
    
    // if the action is go_to then the score is 1
    if(action == 'go_to'){
        score = 1
    }
    // if the action is go_pick_up
    if(action == 'go_pick_up'){
        const node = findNearestDelivery(myMap, {x: x, y: y})
        if(parcels.has(predicate[3])){
            // points that myAgent have + points that myAgent will have - points that i lose in order to arrive at destination
            score =  score + parcels.get(predicate[3]).reward - (aStarPathModified(myDag, node, x+'|'+y).length * decading_interval * (carriedByMe.size + 1))

            let vantage = Number.MAX_VALUE
            const alpha = 3
            const beta = 5
            let scoreAdversarial = Number.MAX_VALUE
            // penalize parcels that are nearer other agent wrt me
            for(const [,a] of agentDetected){
                let ourAdvantage = aStarPathModified(myDag, parseInt(a.x)+'|'+parseInt(a.y), x+'|'+y).length - aStarPath(myDag, me.x+'|'+me.y, x+'|'+y).length
                ourAdvantage = alpha*ourAdvantage/(a.countSeen + 1)
                
                if(ourAdvantage < vantage){
                    vantage = ourAdvantage
                    scoreAdversarial = a.score
                }
            }
            if (vantage < 0 && scoreAdversarial*beta > me.score){
                score = score + vantage
            }
        }

        

    }
    // deliver package when the agent have a lot of point
    if(action == 'delivery'){
        if(scorePackageCarriedByMe > 10*parameters['PARCEL_REWARD_AVG']){
            score = 1000
        }
        if(me.x == x && me.y == y){
            score = 1000
        }
    }
    // put the score at 0 if is not possibile to arrive in that position
    if (aStarPathModified(myDag, Math.trunc(me.x)+'|'+Math.trunc(me.y), Math.trunc(x)+'|'+Math.trunc(y)).length === 0){
        score = 0
    }
    //console.log(predicate, score, parcels[predicate[3]], distanceString(x +'|'+ y, findNearestDelivery(myMap, {x: x, y: y}), distance({x,y}, me), Object.keys(carriedByMe).length, scorePackageCarriedByMe)
    return score;
}


/**
 * Start intention revision loop
 */


const myAgent = new IntentionRevisionRevise();

myAgent.loop();



/**
 * Intention
 */
class Intention {

    // Plan currently used for achieving the intention 
    #current_plan;
    
    // This is used to stop the intention
    #stopped = false;
    get stopped () {
        return this.#stopped;
    }
    stop () {
        // this.log( 'stop intention', ...this.#predicate );
        this.#stopped = true;
        if ( this.#current_plan)
            this.#current_plan.stop();
    }

    /**
     * #parent refers to caller
     */
    get parent(){
        return this.#parent;
    }
    #parent;
    /**
     * predicate is in the form ['go_to', x, y]
     */
    get predicate () {
        return this.#predicate;
    }
    #predicate;

    constructor ( parent, predicate ) {
        this.#parent = parent;
        this.#predicate = predicate;
    }

    log ( ...args ) {
        if ( this.#parent && this.#parent.log )
            this.#parent.log( '\t', ...args )
        else
            console.log( ...args )
    }

    #started = false;
    /**
     * Using the plan library to achieve an intention
     */
    async achieve () {
        // Cannot start twice
        if ( this.#started)
            return this;
        else
            this.#started = true;

        // Trying all plans in the library
        for (const planClass of planLibrary) {

            // if stopped then quit
            if ( this.stopped ) throw [ 'stopped intention', ...this.predicate ];

            // if plan is 'statically' applicable
            if ( planClass.isApplicableTo( ...this.predicate ) ) {
                // plan is instantiated
                this.#current_plan = new planClass(this.parent);
                this.log('achieving intention', ...this.predicate, 'with plan', planClass.name);
                this.log('parent is:', this.#parent)
                // and plan is executed and result returned
                try {
                    const plan_res = await this.#current_plan.execute( ...this.predicate);
                    this.log( 'succesful intention', ...this.predicate, 'with plan', planClass.name, 'with result:', plan_res );
                    return plan_res
                // or errors are caught so to continue with next plan
                } catch (error) {
                    this.log( 'failed intention', ...this.predicate,'with plan', planClass.name, 'with error:', ...error );
                }
            }

        }

        // if stopped then quit
        if ( this.stopped ) throw [ 'stopped intention', ...this.predicate ];

        // no plans have been found to satisfy the intention
        // this.log( 'no plan satisfied the intention ', ...this.predicate );
        throw ['no plan satisfied the intention ', ...this.predicate ]
    }

}

/**
 * Plan library
 */
const planLibrary = [];

// class that is used in order execute actions
class Plan {

    // This is used to stop the plan
    #stopped = false;
    stop () {
        // this.log( 'stop plan' );
        this.#stopped = true;
        for ( const i of this.#sub_intentions ) {
            i.stop();
        }
    }
    get stopped () {
        return this.#stopped;
    }

    /**
     * #parent refers to caller
     */
    #parent;

    constructor ( parent ) {
        this.#parent = parent;
    }

    log ( ...args ) {
        if ( this.#parent && this.#parent.log )
            this.#parent.log( '\t', ...args )
        else
            console.log( ...args )
    }

    // this is an array of sub intention. Multiple ones could eventually being achieved in parallel.
    #sub_intentions = [];

    async subIntention ( predicate ) {
        const sub_intention = new Intention( this, predicate );
        this.#sub_intentions.push( sub_intention );
        return await sub_intention.achieve();
    }

}
// Class that is used in order to pick up a parcel 
// This class use the astar algorithm in order to reach the parcel
// (The subIntention('go_to', x, y) is used in order to reach the parcel
class GoPickUp extends Plan {

    static isApplicableTo ( go_pick_up, x, y, id ) {
        return go_pick_up == 'go_pick_up';
    }

    async execute ( go_pick_up, x, y, id) {
        if ( this.stopped ) throw ['stopped']; // if stopped then quit
        let res = await this.subIntention('go_to', x, y);
        if (!res){
            return false;
        }

        if ( this.stopped ) throw ['stopped']; // if stopped then quit
        await client.pickup()
        if ( this.stopped ) throw ['stopped']; // if stopped then quit
        return true;

    }

}
// Class that is used in order to deliver a parcel
// Ask to the partner if I cannot reach the desire position
// This class work with the astar algorithm in order to reach the delivery position
class GoDelivery extends Plan {

    static isApplicableTo ( delivery, x, y) {
        return delivery == 'delivery';
    }

    //check if I can reach the delivery point, otherwise ask to myPartnerId
    async execute ( delivery, x, y ) {
        if ( this.stopped ) throw ['stopped']; // if stopped then quit
        let result = await this.subIntention( ['go_to', x, y] );
        if (!result){ // if I can not reach it
            
            return false;
        }
        if ( this.stopped ) throw ['stopped']; // if stopped then quit
        let result_putdown = await client.putdown();
        if(result_putdown.length > 0){
            // remove all parcels that were put down from parcel map (otherwise, it will get stuck on delivery tile)
            for (const [p_id, parcel] of parcels.entries()){
                if (parcel.carriedBy == me.id){
                    parcels.delete(p_id);
                    parcel_timers.delete(p_id);
                }
            }
        } // in teoria ora modifyGlobalVariables() non dovrebbe più servire
        if ( this.stopped ) throw ['stopped']; // if stopped then quit
        await modifyGlobalVariables()
        return true;
    }

}

// Class that is used in order to make a step randomly
class MoveRandom extends Plan {

    static isApplicableTo (move_random) {
        return move_random == 'move_random';
    }

    async execute (move_random) {

    if ( this.stopped ) throw ['stopped']; // if stopped then quit

    let status_x = false;
    let status_y = false;
    const random = Math.floor(Math.random() * 4) + 1;
    // this.log('me', me, 'xy', x, y);

    if ( random == 1 )
        status_x = await client.move('right')
        // status_x = await this.subIntention( 'go_to', {x: me.x+1, y: me.y} );
    else if ( random == 2 )
        status_x = await client.move('left')
        // status_x = await this.subIntention( 'go_to', {x: me.x-1, y: me.y} );

    if (status_x) {
        me.x = status_x.x;
        me.y = status_x.y;
    }

    if ( this.stopped ) throw ['stopped']; // if stopped then quit

    if ( random == 3)
        status_y = await client.move('up')
        // status_x = await this.subIntention( 'go_to', {x: me.x, y: me.y+1} );
    else if ( random == 4)
        status_y = await client.move('down')
        // status_x = await this.subIntention( 'go_to', {x: me.x, y: me.y-1} );

    if (status_y) {
        me.x = status_y.x;
        me.y = status_y.y;
    }
    
    if ( ! status_x && ! status_y) {
        this.log('stucked from random');
        throw 'stucked';
    }
    return true;
    }
}



//Read the domain file
let domain = await readFile('./new_domain.pddl');

// Class that execute the go_to actions
// Work with the PDDL Domain and Problem
class PddlPlan extends Plan{

    static isApplicableTo ( go_to, x, y ) {
        return go_to == 'go_to';
        
    }

    async execute ( go_to, x, y ) {
        // Define the PDDL goal
        let goal = 'at ' + me.name + ' ' + 't' + x + '_' + y;

        // Create the PDDL problem
        var pddlProblem = new PddlProblem(
            'deliveroo',
            myBeliefset.objects.join(' ') + ' ' + me.name,
            myBeliefset.toPddlString() + ' ' + '(me ' + me.name + ')' + '(at ' + me.name + ' ' + 't' + me.x + '_' + me.y + ')',
            goal
        );

        let problem = pddlProblem.toPddlString();
        // Get the plan from the online solver
        var plan = await onlineSolver(domain, problem);
        let coordinates = []
        //Populate the coordinates array with the x and y of the plan
        plan.forEach(action => {
            let end = action.args[2].split('_');   
            coordinates.push({
              x: parseInt(end[0].substring(1)), 
              y: parseInt(end[1])                  
            });
          });
        let countStacked = 3
        console.log("execute")
        console.log(coordinates)
        // Loop through the coordinates array and move the agent to the desired position
        while ( me.x != x || me.y != y ) {
            
            if ( this.stopped ) throw ['stopped']; // if stopped then quit

            let coordinate = coordinates.shift()
            //console.log(coordinate[0],coordinate[1])
            let status_x = false;
            let status_y = false;

            // this.log('me', me, 'xy', x, y);
            
            if(coordinate.x == me.x && coordinate.y == me.y){
                continue;
            }

            if ( coordinate.x > me.x )
                status_x = await client.move('right')
                // status_x = await this.subIntention( 'go_to', {x: me.x+1, y: me.y} );
            else if ( coordinate.x < me.x )
                status_x = await client.move('left')
                // status_x = await this.subIntention( 'go_to', {x: me.x-1, y: me.y} );

            if (status_x) {
                me.x = status_x.x;
                me.y = status_x.y;
            }

            if ( this.stopped ) throw ['stopped']; // if stopped then quit

            if ( coordinate.y > me.y )
                status_y = await client.move('up')
                // status_x = await this.subIntention( 'go_to', {x: me.x, y: me.y+1} );
            else if ( coordinate.y < me.y )
                status_y = await client.move('down')
                // status_x = await this.subIntention( 'go_to', {x: me.x, y: me.y-1} );

            if (status_y) {
                me.x = status_y.x;
                me.y = status_y.y;
            }
            
            if ( ! status_x && ! status_y) {
                this.log('stucked from pddlplan', countStacked);
                await timeout(1000)
                if(countStacked <= 0){
                    return false;
                    throw 'stopped';
                }else{
                    countStacked -= 1;
                }

            } else if ( me.x == x && me.y == y ) {
                // this.log('target reached');
            }
            
        }

        return true;

    }
}


// Class that is used in order to pick up a parcel
// This class work with the PDDL Domain and Problem
class PddlGoPickUp extends Plan {

    static isApplicableTo(go_pick_up, x, y, id) {
        return go_pick_up == 'go_pick_up';
    }

    async execute(go_pick_up, x, y, id) {
        // Define the PDDL goal
        let goal = 'and (holding ' + me.name + ' p' + id + ' )(not (at p' + id + ' ' + 't' + x + '_' + y + '))';
        // Create the PDDL problem
        var pddlProblem = new PddlProblem(
            'deliveroo',
            myBeliefset.objects.join(' ') + ' ' + me.name + ' p' + id,
            myBeliefset.toPddlString() + ' ' + '(me ' + me.name + ')' + '(at ' + me.name + ' ' + 't' + me.x + '_' + me.y + ')' + '(at p' + id + ' ' + 't' + x + '_' + y + ')' + '(parcel p' + id + ')',
            goal
        );

        let problem = pddlProblem.toPddlString();
        // Get the plan from the online solver
        var plan = await onlineSolver(domain, problem);
        let coordinates = [];
        //Populate the coordinates array with the x and y of the plan
        plan.forEach(action => {
            let end = action.args[2].split('_');
            coordinates.push({
                action: action.action,
                x: parseInt(end[0].substring(1)),
                y: parseInt(end[1])
            });
        });

        let countStacked = 3;
        console.log("execute");

        while (coordinates.length > 0) {
            if (this.stopped) throw ['stopped']; // if stopped then quit

            let coordinate = coordinates.shift();
            let status_x = false;
            let status_y = false;

            if (coordinate.action === 'PICK-UP') {
                await client.pickup();
            }

            if (coordinate.x > me.x)
                status_x = await client.move('right');
            else if (coordinate.x < me.x)
                status_x = await client.move('left');

            if (status_x) {
                me.x = status_x.x;
                me.y = status_x.y;
            }

            if (this.stopped) throw ['stopped']; // if stopped then quit

            if (coordinate.y > me.y)
                status_y = await client.move('up');
            else if (coordinate.y < me.y)
                status_y = await client.move('down');

            if (status_y) {
                me.x = status_y.x;
                me.y = status_y.y;
            }

            if (!status_x && !status_y) {
                this.log('stucked from pddlgopickup', countStacked);
                await timeout(1000);
                if (countStacked <= 0) {
                    throw 'stopped'; // modified from stucked
                } else {
                    countStacked -= 1;
                }
            }
        }

        return true;
    }
}

// Class that is used in order to deliver a parcel
// This class work with the PDDL Domain and Problem
class PddlGoDelivery extends Plan {

    static isApplicableTo(delivery, x, y) {
        console.log("APPLICABLE:")
        return delivery == 'delivery';
    }

    async execute(delivery, x, y) {
        console.log("EXECUTE:")
        // Define the PDDL goal for delivery
        let id = carriedByMe.keys().next().value;
        let deliveryGoal = 'and (at p' + id + ' t' + x + '_' + y + ') (not (holding ' + me.name + ' p' + id + '))';

        // Create the PDDL problem for delivery
        var pddlDeliveryProblem = new PddlProblem(
            'deliveroo',
            myBeliefset.objects.join(' ') + ' ' + me.name + ' p' + id,
            myBeliefset.toPddlString() + ' ' + '(me ' + me.name + ')' + '(at ' + me.name + ' ' + 't' + me.x + '_' + me.y + ')' + '(holding ' + me.name + ' p' + id + ')' + '(delivery t' + x + '_' + y + ')' + '(parcel p' + id + ')',
            deliveryGoal
        );

        let deliveryProblem = pddlDeliveryProblem.toPddlString();
        // Get the delivery plan from the online solver
        var deliveryPlan = await onlineSolver(domain, deliveryProblem);

        // Check if the plan is valid
        if (!deliveryPlan || deliveryPlan.length === 0) {
            // If I cannot reach it

            return false;
        }

        let deliveryCoordinates = [];
        //Populate the deliveryCoordinates array with the x and y of the plan
        deliveryPlan.forEach(action => {
            let end = action.args[2].split('_');
            deliveryCoordinates.push({
                action: action.action,
                x: parseInt(end[0].substring(1)),
                y: parseInt(end[1])
            });
        });

        let countStacked = 3;
        console.log("execute delivery");

        // Execute the delivery plan
        while (deliveryCoordinates.length > 0) {
            if (this.stopped) throw ['stopped']; // if stopped then quit

            let coordinate = deliveryCoordinates.shift();
            let status_x = false;
            let status_y = false;

            if (coordinate.action === 'DELIVER') {
                await client.putdown();
                await modifyGlobalVariables();
                break; // stop the loop after delivery
            }

            if (coordinate.x > me.x)
                status_x = await client.move('right');
            else if (coordinate.x < me.x)
                status_x = await client.move('left');

            if (status_x) {
                me.x = status_x.x;
                me.y = status_x.y;
            }

            if (this.stopped) throw ['stopped']; // if stopped then quit

            if (coordinate.y > me.y)
                status_y = await client.move('up');
            else if (coordinate.y < me.y)
                status_y = await client.move('down');

            if (status_y) {
                me.x = status_y.x;
                me.y = status_y.y;
            }

            if (!status_x && !status_y) {
                this.log('stucked from pddlgodelivery', countStacked);
                await timeout(1000);
                if (countStacked <= 1) {
                    //return false;
                    throw 'stopped'; // modified from stucked
                } else {
                    countStacked -= 1;
                }
            }
        }

        return true;
    }
}

// Class that is used in order to move to a specific position
// Use the Astarpath in order to reach the desired position
// Check if is stucked and try to find a new path
class AstarPlan extends Plan{

    static isApplicableTo ( go_to, x, y ) {
        return go_to == 'go_to';
        
    }

    async execute ( go_to, x, y ) {
        const path = aStarPathModified(myDag, Math.trunc(me.x)+'|'+Math.trunc(me.y), Math.trunc(x)+'|'+Math.trunc(y))
        let countStacked = 3
        console.log("execute")
        while ( me.x != x || me.y != y ) {
            
            if ( this.stopped ) throw ['stopped']; // if stopped then quit

            let coordinate = stringToCoordinate(path.shift())
            //console.log(coordinate[0],coordinate[1])
            let status_x = false;
            let status_y = false;

            // this.log('me', me, 'xy', x, y);
            
            if(coordinate[0] == me.x && coordinate[1] == me.y){
                continue;
            }

            if ( coordinate[0] > me.x )
                status_x = await client.move('right')
                // status_x = await this.subIntention( 'go_to', {x: me.x+1, y: me.y} );
            else if ( coordinate[0] < me.x )
                status_x = await client.move('left')
                // status_x = await this.subIntention( 'go_to', {x: me.x-1, y: me.y} );

            if (status_x) {
                me.x = status_x.x;
                me.y = status_x.y;
            }

            if ( this.stopped ) throw ['stopped']; // if stopped then quit

            if ( coordinate[1] > me.y )
                status_y = await client.move('up')
            else if ( coordinate[1] < me.y )
                status_y = await client.move('down')

            if (status_y) {
                me.x = status_y.x;
                me.y = status_y.y;
            }
            
            if ( ! status_x && ! status_y) {
                this.log('stucked ', countStacked);
                if (countStacked > 1){ //Wait for 1 second and try again when countStacked > 1
                    await timeout(1000)
                }else{ // if countStacked <= 1, try to find a new path
                    path = aStarPathModified(myDag, Math.trunc(me.x)+'|'+Math.trunc(me.y), Math.trunc(x)+'|'+Math.trunc(y))
                    if (path.length == 0){
                        throw 'stopped';
                    }
                }
                await timeout(1000)
                if(countStacked <= 0){
                    throw 'stopped'; 
                }else{
                    countStacked -= 1;
                }

            } else if ( me.x == x && me.y == y ) {
                // this.log('target reached');
            }
            
        }

        return true;

    }
}

// await 1 sec
function timeout(mseconds) {
    return new Promise(resolve => {
      setTimeout(() => {
        resolve();
      }, mseconds);
    });
  }

function aStarPathModified(dag, start, goal) {

    const frontier = [];
    const explored = [];

    class Node {
        node_name;
        pathCost;
        heuristic;
        completeDistance;
        parent;
        constructor(node_name, parent, pathCost, heuristic) {
            this.node_name = node_name;
            this.parent = parent;
            this.pathCost = pathCost;
            this.heuristic = heuristic;
            this.completeDistance = pathCost + heuristic;
        }
    }

    function indexInArray(node, array) {
        return array.findIndex((element) => element.node_name == node.node_name);
    }

    function solution(node) {
        const array = [];
        while (node != null) {
            array.push(node.node_name);
            node = node.parent;
        }
        return array.reverse();
    }

    if (start.includes(".") || goal.includes(".")) {
        return [];
    }

    frontier.push(new Node(start, null, 0, distanceString(start, goal)));

    while (frontier.length !== 0) {
        frontier.sort((a, b) => a.completeDistance - b.completeDistance);
        const lowestCostNode = frontier.shift();
        if (lowestCostNode.node_name === goal) {
            return solution(lowestCostNode);
        }

        explored.push(lowestCostNode);

        const neighbours = dag.getNeighbours(lowestCostNode.node_name)
            .filter(neighbour => !isOccupied(neighbour));

        for (const childName of neighbours) {
            const childNode = new Node(
                childName,
                lowestCostNode,
                lowestCostNode.pathCost + 1,
                distanceString(childName, goal)
            );
            const indexExplored = indexInArray(childNode, explored);
            const indexFrontier = indexInArray(childNode, frontier);
            if (indexExplored === -1 && indexFrontier === -1) {
                frontier.push(childNode);
            } else if (indexFrontier !== -1 && frontier[indexFrontier].completeDistance > childNode.completeDistance) {
                frontier[indexFrontier] = childNode;
            }
        }
    }

    return [];
}

// if an agent is position over a specific node
function isOccupied(node) {
    const [x, y] = node.split('|').map(Number);
    return isPositionOccupied(x, y);
}

function isPositionOccupied(x, y) {
    for (const agent of agentDetected.values()) {
        if (agent.x === x && agent.y === y && agent.countSeen < 10) {
            return true;
        }
    }
    return false;
}

// plan classes are added to plan library 
planLibrary.push( PddlGoPickUp )
//planLibrary.push( AstarPlan )
planLibrary.push( PddlPlan )
planLibrary.push( PddlGoDelivery )
planLibrary.push( MoveRandom )
