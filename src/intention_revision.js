import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";

const client = new DeliverooApi(
    //'https://deliveroojs2.onrender.com',
    'http://localhost:8080',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjZkYzg3NDBlMjJhIiwibmFtZSI6ImNpYW8iLCJpYXQiOjE3MTQ4Mjg3MTF9.rUawy6LtitVA8QQV2R2MY0XsEY_PtM0B4-jxml0JTPk'
)

function distance( {x:x1, y:y1}, {x:x2, y:y2}) {
    const dx = Math.abs( Math.round(x1) - Math.round(x2) )
    const dy = Math.abs( Math.round(y1) - Math.round(y2) )
    return dx + dy;
}

function distanceString(node1, node2){
    const coordinate1 = node1.split("|");
    const coordinate2 = node2.split("|");
    const dx = Math.abs( Math.round(coordinate1[0]) - Math.round(coordinate2[0]) )
    const dy = Math.abs( Math.round(coordinate1[1]) - Math.round(coordinate2[1]) )
    return dx + dy;
}

function stringToCoordinate(node){
    return node.split("|");
}

class MyMap {
    #dimX
    #dimY
    #matrixTiles
    #deliveryTiles
    getDimension(){
        return [this.#dimX, this.#dimY]
    }

    getMatrix(){
        return this.#matrixTiles
    }
    getDelivery(){
        return this.#deliveryTiles
    }
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
        for (const tile of arrayTiles) {
            let temp = 0
            if (tile.delivery){
                temp = 2
                this.#deliveryTiles.push(tile.x+'|'+tile.y)
            } else if (!tile.delivery && tile.parcelSpawner){
                temp = 1
            } else if (!tile.delivery && !tile.parcelSpawner){
                temp = 3
            }
            this.#matrixTiles[tile.x][tile.y] = temp
        }
        //return this.#matrixTiles
    }
}


class Dag{
    #dag

    constructor (map){
        this.#dag = new Map()
        this.initializeDag(map)
    }

    initializeDag(map){
        for(var i = 0; i < map.getDimension()[0]; i++){
            for (var j = 0; j<map.getDimension()[1]; j++){
                if (map.getValue(i,j) != 0){
                    this.#dag.set((i+'|'+j), map.getNeighbours(i,j))
                }
            }
        }
    }

    getNeighbours(string){
        return this.#dag.get(string)
    }
}

let myMap = {}
let myDag = {}

client.onMap( (x, y, deliveryMap) => {
    myMap = new MyMap(x, y, deliveryMap)
    myDag = new Dag(myMap)
})

function aStarPath (dag, start, goal){
    const frontier = []
    const explored = []

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

    function indexInArray(node, array){
        return array.findIndex((element) => element.node_name == node.node_name)
    }

    function solution(node){
        const array=[]
        while(node != null){
            array.push(node.node_name)
            node = node.parent
        }
        return array.reverse()
    }

    if(start.includes(".") || goal.includes(".")){
        return []
    }
    frontier.push(new Node(start, null, 0, distanceString(start, goal)))
    //console.log(frontier)
    while (frontier.length !== 0) {
        frontier.sort((a, b) => a.completeDistance - b.completeDistance);
        const lowestCostNode = frontier.shift();
        if (lowestCostNode.node_name === goal) {
            return solution(lowestCostNode);
        }

        explored.push(lowestCostNode);

        const neighbours = dag.getNeighbours(lowestCostNode.node_name);
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

/**
 * Beliefset revision function
 */
const me = {};

client.onYou( ( {id, name, x, y, score} ) => {
    me.id = id
    me.name = name
    me.x = x
    me.y = y
    me.score = score
    //console.log(x, y, myDag.getNeighbours(x+'|'+y))
    //console.log(aStarPath(myDag, x+'|'+y, 15+'|'+5))
})
const parcels = new Map();
let carriedByMe = new Map()

async function modifyGlobalVariables(){
    carriedByMe = new Map()
}

client.onParcelsSensing( async ( perceived_parcels ) => {
    for (const p of perceived_parcels) {
        parcels[p.id] = p.reward
        if (Object.keys(parcels).length > 20){
            let keys = Object.keys(parcels)
            let toDelete = keys[0]
            delete parcels[toDelete]
        }
    }
    //console.log("--------------")
    //console.log(parcels)
} )

let parameters = null
client.onConfig( (param) => {
    parameters = param
    console.log(parameters);
} )

function findNearestDelivery(map, object){
    let distance = Number.MAX_VALUE
    let node = null
    for(const pos of map.getDelivery()){
        const dist2me = distanceString(object.x+'|'+object.y, pos)
        if (dist2me<distance){
            distance = dist2me
            node = pos
        }
    }
    return node
}

/**
 * Options generation and filtering function
 */
client.onParcelsSensing( parcels => {
    //? gestire parcelsensing perché si attiva solo con un pacchetto
    // TODO revisit beliefset revision so to trigger option generation only in the case a new parcel is observed
    //carried by 
    //distanza massima
    //se non ci sono pacchetti nuovi rispetto history muoviti verso il centro
    //se non ci sono pacchetti nuovi risp   history e ho un pacchetto io carriedBy consegnalo

    //parcels 
    /**
     * Options generation
     */
    
    const options = []
    for (const parcel of parcels.values())
        if ( ! parcel.carriedBy ){
            options.push( [ 'go_pick_up', parcel.x, parcel.y, parcel.id ] );
        }else if(parcel.carriedBy == me.id){
            carriedByMe.set(parcel.id, parcel.reward)
        }
    //Go to delivery
    //!Delivery???
    if (carriedByMe.size != 0){
        const coordinate = stringToCoordinate(findNearestDelivery(myMap, me))
        myAgent.removeDelivery()
        myAgent.push( ['delivery', coordinate[0], coordinate[1]])
    }else if(options.length==0 && carriedByMe.size == 0){
        //todo muoviti random
        myAgent.push(['go_to', 12, 12])
        /*
        if (me.x % 1 == 0 && me.y % 1 == 0){
            const neighbours = myDag.getNeighbours(me.x+'|'+me.y)
            const random = Math.floor(Math.random() * neighbours.length) 
            const coordinate = stringToCoordinate(neighbours[random])
            //console.log("go to", coordinate, random)
            myAgent.push(['go_to', coordinate[0], coordinate[1]])
        }
        */
    }
    //Move randomly
    //if (options.length==0 && )
    /**
     * Options filtering
     */
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

    /**
     * Best option is selected
     */
    if ( best_option )
        myAgent.push( best_option )

} )

let agentDetected = new Map();
client.onAgentsSensing( (agents) =>{
    //myAgent.push(['go_to', 12, 12])
    for(const agent of agents){
        agentDetected.set(agent.id, agent)
    }
    //console.log("Agents Sensing--------",agentDetected);
} )
// client.onYou( agentLoop )


/**
 * Intention revision loop
 */
class IntentionRevision {

    #intention_queue = new Array();
    get intention_queue () {
        return this.#intention_queue;
    }
    async removeDelivery (){
        this.#intention_queue = this.#intention_queue.filter((elem) => elem.predicate[0] != 'delivery')
    }

    async loop ( ) {
        while ( true ) {
            // Consumes intention_queue if not empty
            if ( this.intention_queue.length > 0 ) {
                console.log( 'intentionRevision.loop', this.intention_queue.map(i=>i.predicate) );
                
                // Current intention
                const intention = this.intention_queue[0];
                
                // Is queued intention still valid? Do I still want to achieve it?
                // TODO this hard-coded implementation is an example
                let id = intention.predicate[2]
                let p = parcels.get(id)
                if ( p && p.carriedBy ) {
                    console.log( 'Skipping intention because no more valid', intention.predicate )
                    continue;
                }

                // Start achieving intention
                await intention.achieve()
                // Catch eventual error and continue
                .catch( error => {
                    // console.log( 'Failed intention', ...intention.predicate, 'with error:', ...error )
                } );
                
                // Remove from the queue
                //? go_to gestito 
                //!if (intention.predicate[0] != 'go_to'){
                this.#intention_queue = this.#intention_queue.filter((elem) => elem.predicate.join(' ') != intention.predicate.join(' '))
                //!}
                //this.intention_queue.shift();
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

class IntentionRevisionQueue extends IntentionRevision {

    async push ( predicate ) {
        
        // Check if already queued
        if ( this.intention_queue.find( (i) => i.predicate.join(' ') == predicate.join(' ') ) )
            return; // intention is already queued

        console.log( 'IntentionRevisionReplace.push', predicate );
        const intention = new Intention( this, predicate );
        this.intention_queue.push( intention );
    }

}

function see_queue(queue){
    console.log('\x1b[36m%s\x1b[0m', "Start Queue Intention")
    for(const elem of queue){
        console.log("Intention:",elem.predicate, elem.parent, "Utility: ", UtilityFunction(elem.predicate, elem.parent))
    }
    console.log('\x1b[36m%s\x1b[0m', "End Queue Intention")
}

class IntentionRevisionReplace extends IntentionRevision {

    async push ( predicate ) {
        // Check if already queued
        if(this.intention_queue.length > 0){
            for(const elem of this.intention_queue){
                if(elem.predicate.join(' ') == predicate.join(' ')){
                    //console.log("già presente nella coda")
                    return;
                }
            }
        }
        //? modificare e mettere [0]  
        const first = this.intention_queue.at( this.intention_queue.length - 1 );
        //* cancel
        if ( first && first.predicate.join(' ') == predicate.join(' ') ) {
            return; // intention is already being achieved
        }
        
        console.log( 'IntentionRevisionReplace.push', predicate );
        const intention = new Intention( this, predicate );
        //console.log("Utility Function:", UtilityFunction(intention.predicate, intention.parent))
        
        this.intention_queue.push( intention );
        this.intention_queue.sort((a, b) => UtilityFunction(b.predicate, b.parent) - UtilityFunction(a.predicate, a.parent))
        this.intention_queue.filter(item => { return UtilityFunction(item.predicate, item.parent) > 0; });
        const first2 = this.intention_queue[0];
        // Force current intention stop
        if (first & first2){
            console.log(first.predicate.join(' '), first2.predicate.join(' ')) //perché undefinded first ae first 2?
        }
        //! gestire 2 delivery nella coda
        if ( first && first2 && first.predicate.join(' ') != first2.predicate.join(' ') ) {
            console.log(first, first2)
            first.stop();
        }
        see_queue(this.intention_queue)
    }

}

class IntentionRevisionRevise extends IntentionRevision {

    async push ( predicate ) {
        console.log( 'Revising intention queue. Received', ...predicate );
        // TODO
        // - order intentions based on utility function (reward - cost) (for example, parcel score minus distance)
        // - eventually stop current one
        // - evaluate validity of intention
        // Check if already queued
        const last = this.intention_queue.at( this.intention_queue.length - 1 );
        if ( last && last.predicate.join(' ') == predicate.join(' ') ) {
            return; // intention is already being achieved
        }
        const intention = new Intention( this, predicate );
        console.log("Utility Function:", UtilityFunction(intention.predicate, intention.parent))
        this.intention_queue.push( intention );
        // Force current intention stop 
        if ( last ) {
            last.stop();
        }
    }

}

/*
*point of parcels
*distace 
*agents adversarial near parcels
*parcel near delivery zone
tile near package


*/
function UtilityFunction(predicate, parent){
    const action = predicate[0]
    const x = predicate[1]
    const y = predicate[2]
    let score = 0
    let decadig_interval = 0
    let distance_score = distance({x,y}, me) * (parameters['MOVEMENT_DURATION']/1000)
    if (parameters['PARCEL_DECADING_INTERVAL'] != 'infinite'){
        decadig_interval = parseInt(parameters['PARCEL_DECADING_INTERVAL'])
        distance_score = distance_score / decadig_interval
    }
    let scoreNearestAgents = 0
    for(const [,a] of agentDetected){ //! agent could not be in this position
        const radius = 3
        if (a.x < x + radius && a.x > x - radius && a.y < y + radius && a.y > y - radius && me.x != a.x && me.y != a.y){
            console.log("Agent Near Parcels")
            scoreNearestAgents = scoreNearestAgents + parameters['PARCEL_REWARD_AVG'] / 20
        }
    }

    if(action == 'go_to'){
        score = 4
    }
    if (action == 'go_pick_up'){
        console.log("-------------------",predicate, parcels[predicate[3]])
        const scorePackage = parcels[predicate[3]] - distance_score
        const node = findNearestDelivery(myMap, {x: x, y: y})
        const parcel_distance_delivery_zone = distanceString(x +'|'+y, node)
        score = scorePackage
        score =  score - parcel_distance_delivery_zone
        if (scoreNearestAgents > 0){
            score = 0
        }
    }
    if (action == 'delivery'){
        let scorePackageCarriedByMe = 0
        for (const [,score] of carriedByMe) {
            scorePackageCarriedByMe = scorePackageCarriedByMe + score;
        }
        console.log("------------------", predicate, scorePackageCarriedByMe)
        const alpha = 3
        scorePackageCarriedByMe = scorePackageCarriedByMe - Object.keys(carriedByMe).length*distance_score
        //score = alpha*scorePackageCarriedByMe/distance({x,y}, me) + scorePackageCarriedByMe 
        score = score- scoreNearestAgents
        score = scorePackageCarriedByMe
    }



    //let score = 0
    //let action_score = 1
    //let parent_score = 1
    //let agents_near_parcels_score = 20
    //let parcel_score = 0
    //let parcel_distance_delivery_zone = 20
    //let number_package = carriedByMe.size
    //? if delivery -> sum(carriedByMe) >< utility pickup 

    /*
    if (action == 'go_to') { //CONTROLLARE GO PICK UP //controllare pickup
        score = 0.5
    }
    
    if (action == 'go_pick_up'){
        const element = Array.from(parcels.values()).find(elemento => {
            return elemento.x === x && elemento.y === y;
          });
        parcel_score = element.score
        const node = findNearestDelivery(myMap, {x: element.x, y: element.y})
        parcel_distance_delivery_zone = distanceString(element.x +'|'+element.y, node)
        let bestDistance = Number.MAX_VALUE
        agentDetected.forEach((agent, id) => {
            const distance = distance([agent.x, agent.y], [element.x, element.y])
            if (bestDistance > distance){
                bestDistance = distance
            }
        })
        agents_near_parcels_score = bestDistance
    }                                                                   //
    score = (action_score && parent_score)*(parcel_score/distance_score)*(1/parcel_distance_delivery_zone) // distance = 5  score = 40 //distance = 10 score = 50
    if(agents_near_parcels_score < 3){
        score = 0
    }
    */
    // todo togliere noi come agent negli agent vicini al pacchetto
    return score;
}

/**
 * Start intention revision loop
 */

// const myAgent = new IntentionRevisionQueue();
const myAgent = new IntentionRevisionReplace();
// const myAgent = new IntentionRevisionRevise();
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

class GoPickUp extends Plan {

    static isApplicableTo ( go_pick_up, x, y, id ) {
        return go_pick_up == 'go_pick_up';
    }

    async execute ( go_pick_up, x, y) {
        if ( this.stopped ) throw ['stopped']; // if stopped then quit
        await this.subIntention( ['go_to', x, y] );
        if ( this.stopped ) throw ['stopped']; // if stopped then quit
        await client.pickup()
        if ( this.stopped ) throw ['stopped']; // if stopped then quit
        return true;

    }

}

class GoDelivery extends Plan {

    static isApplicableTo ( delivery, x, y) {
        return delivery == 'delivery';
    }

    async execute ( delivery, x, y ) {
        if ( this.stopped ) throw ['stopped']; // if stopped then quit
        await this.subIntention( ['go_to', x, y] );
        if ( this.stopped ) throw ['stopped']; // if stopped then quit
        await client.putdown();
        if ( this.stopped ) throw ['stopped']; // if stopped then quit
        await modifyGlobalVariables()
        return true;
    }

}

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
        this.log('stucked');
        throw 'stucked';
    }
    return true;
    }
}

class BlindMove extends Plan {

    static isApplicableTo ( go_to, x, y ) {
        return go_to == 'go_to';
    }

    async execute ( go_to, x, y ) {

        while ( me.x != x || me.y != y ) {

            if ( this.stopped ) throw ['stopped']; // if stopped then quit

            let status_x = false;
            let status_y = false;
            
            // this.log('me', me, 'xy', x, y);

            if ( x > me.x )
                status_x = await client.move('right')
                // status_x = await this.subIntention( 'go_to', {x: me.x+1, y: me.y} );
            else if ( x < me.x )
                status_x = await client.move('left')
                // status_x = await this.subIntention( 'go_to', {x: me.x-1, y: me.y} );

            if (status_x) {
                me.x = status_x.x;
                me.y = status_x.y;
            }

            if ( this.stopped ) throw ['stopped']; // if stopped then quit

            if ( y > me.y )
                status_y = await client.move('up')
                // status_x = await this.subIntention( 'go_to', {x: me.x, y: me.y+1} );
            else if ( y < me.y )
                status_y = await client.move('down')
                // status_x = await this.subIntention( 'go_to', {x: me.x, y: me.y-1} );

            if (status_y) {
                me.x = status_y.x;
                me.y = status_y.y;
            }
            
            if ( ! status_x && ! status_y) {
                this.log('stucked');
                throw 'stucked';
            } else if ( me.x == x && me.y == y ) {
                // this.log('target reached');
            }
            
        }

        return true;

    }
}

let blackList = new Array()

class AstarPlan extends Plan{

    static isApplicableTo ( go_to, x, y ) {
        return go_to == 'go_to';
    }

    async execute ( go_to, x, y ) {
        const path = aStarPath(myDag, me.x+'|'+me.y, x+'|'+y)
        //console.log(path)
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
                // status_x = await this.subIntention( 'go_to', {x: me.x, y: me.y+1} );
            else if ( coordinate[1] < me.y )
                status_y = await client.move('down')
                // status_x = await this.subIntention( 'go_to', {x: me.x, y: me.y-1} );

            if (status_y) {
                me.x = status_y.x;
                me.y = status_y.y;
            }
            
            if ( ! status_x && ! status_y) {
                this.log('stucked ', countStacked);
                //await this.subIntention( 'go_to', {x: x, y: y} );
                await timeout(1000)
                if(countStacked <= 0){
                    throw 'stucked';
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

function timeout(mseconds) {
    return new Promise(resolve => {
      setTimeout(() => {
        resolve();
      }, mseconds);
    });
  }
// plan classes are added to plan library 
planLibrary.push( GoPickUp )
planLibrary.push( AstarPlan )
planLibrary.push( GoDelivery )
planLibrary.push( MoveRandom )
