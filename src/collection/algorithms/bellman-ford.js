import * as is from '../../is';
import { warn, defaults } from '../../util';
import Map from '../../map';

const bellmanFordDefaults = defaults({
  weight: edge => 1,
  directed: false,
  root: null
});

let elesfn = ({

  // Implemented from pseudocode from wikipedia
  bellmanFord: function( options ){
    let { weight, directed, root } = bellmanFordDefaults(options);
    let weightFn = weight;
    let eles = this;
    let cy = this.cy();
    let { edges, nodes } = this.byGroup();
    let numNodes = nodes.length;
    let infoMap = new Map();
    let hasNegativeWeightCycle = false;
    let negativeWeightCycles = [];

    root = cy.collection(root)[0]; // in case selector passed

    // remove loops
    for( let i = edges.length - 1; i >= 0; i-- ){
      let edge = edges[i];

      if( edge.isLoop() ){
        edges.unmerge(edge);
      }
    }

    let numEdges = edges.length;

    let getInfo = node => {
      let obj = infoMap.get( node.id() );

      if( !obj ){
        obj = {};

        infoMap.set( node.id(), obj );
      }

      return obj;
    };

    let getNodeFromTo = to => (is.string(to) ? cy.$(to) : to)[0];

    let distanceTo = to => getInfo( getNodeFromTo(to) ).dist;

    let pathTo = (to, thisStart = root) => {
      let end = getNodeFromTo(to);
      let path = [];
      let node = end;

      for( ;; ){
        if( node == null ){ return this.spawn(); }

        let { edge, pred } = getInfo( node );

        path.unshift( node[0] );

        if( node.same(thisStart) && path.length > 0 ){ break; }

        if( edge != null ){
          path.unshift( edge );
        }

        node = pred;
      }

      return eles.spawn( path );
    };

    // Initializations { dist, pred, edge }
    for( let i = 0; i < numNodes; i++ ){
      let node = nodes[i];
      let info = getInfo( node );

      if( node.same(root) ){
        info.dist = 0;
      } else {
        info.dist = Infinity;
      }

      info.pred = null;
      info.edge = null;
    }

    // Edges relaxation
    let replacedEdge = false;

    let checkForEdgeReplacement = (node1, node2, edge, info1, info2, weight) => {
      let dist = info1.dist + weight;

      if( dist < info2.dist && !edge.same(info1.edge) ){
        info2.dist = dist;
        info2.pred = node1;
        info2.edge = edge;
        replacedEdge = true;
      }
    };

    for( let i = 1; i < numNodes; i++ ){
      replacedEdge = false;

      for( let e = 0; e < edges.length; e++ ){
        let edge = edges[e];
        let src = edge.source();
        let tgt = edge.target();
        let weight = weightFn(edge);
        let srcInfo = getInfo(src);
        let tgtInfo = getInfo(tgt);

        checkForEdgeReplacement(src, tgt, edge, srcInfo, tgtInfo, weight);

        // If undirected graph, we need to take into account the 'reverse' edge
        if( !directed ){
          checkForEdgeReplacement(tgt, src, edge, tgtInfo, srcInfo, weight);
        }
      }

      if( !replacedEdge ){ break; }
    }

    if( replacedEdge ){
      // Check for negative weight cycles
      for( let e = 0; e < numEdges; e++ ){
        let edge = edges[e];
        let src = edge.source();
        let tgt = edge.target();
        let weight = weightFn(edge);
        let srcDist = getInfo(src).dist;
        let tgtDist = getInfo(tgt).dist;

        if( srcDist + weight < tgtDist || (!directed && tgtDist + weight < srcDist) ){
          warn('Graph contains a negative weight cycle for Bellman-Ford');

          hasNegativeWeightCycle = true;

          break;
        }
      }
    }

    return {
      distanceTo,
      pathTo,
      hasNegativeWeightCycle,
      negativeWeightCycles
    };

  } // bellmanFord

}); // elesfn

export default elesfn;
