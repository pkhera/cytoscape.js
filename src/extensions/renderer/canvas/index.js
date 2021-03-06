/*
The canvas renderer was written by Yue Dong.

Modifications tracked on Github.
*/

/* global OffscreenCanvas */

import * as util from '../../../util';
import * as is from '../../../is';
import { makeBoundingBox } from '../../../math';
import ElementTextureCache from './ele-texture-cache';
import LayeredTextureCache from './layered-texture-cache';

import arrowShapes from './arrow-shapes';
import drawingElements from './drawing-elements';
import drawingEdges from './drawing-edges';
import drawingImages from './drawing-images';
import drawingLabelText from './drawing-label-text';
import drawingNodes from './drawing-nodes';
import drawingRedraw from './drawing-redraw';
import drawingShapes from './drawing-shapes';
import exportImage from './export-image';
import nodeShapes from './node-shapes';

var CR = CanvasRenderer;
var CRp = CanvasRenderer.prototype;

CRp.CANVAS_LAYERS = 3;
//
CRp.SELECT_BOX = 0;
CRp.DRAG = 1;
CRp.NODE = 2;

CRp.BUFFER_COUNT = 3;
//
CRp.TEXTURE_BUFFER = 0;
CRp.MOTIONBLUR_BUFFER_NODE = 1;
CRp.MOTIONBLUR_BUFFER_DRAG = 2;

function CanvasRenderer( options ){
  var r = this;

  r.data = {
    canvases: new Array( CRp.CANVAS_LAYERS ),
    contexts: new Array( CRp.CANVAS_LAYERS ),
    canvasNeedsRedraw: new Array( CRp.CANVAS_LAYERS ),

    bufferCanvases: new Array( CRp.BUFFER_COUNT ),
    bufferContexts: new Array( CRp.CANVAS_LAYERS ),
  };

  var tapHlOff = '-webkit-tap-highlight-color: rgba(0,0,0,0);';

  r.data.canvasContainer = document.createElement( 'div' ); // eslint-disable-line no-undef
  var containerStyle = r.data.canvasContainer.style;
  r.data.canvasContainer.setAttribute( 'style', tapHlOff );
  containerStyle.position = 'relative';
  containerStyle.zIndex = '0';
  containerStyle.overflow = 'hidden';

  var container = options.cy.container();
  container.appendChild( r.data.canvasContainer );

  if( (container.getAttribute('style') || '').indexOf(tapHlOff) < 0 ){
    container.setAttribute( 'style', ( container.getAttribute( 'style' ) || '' ) + tapHlOff );
  }

  for( var i = 0; i < CRp.CANVAS_LAYERS; i++ ){
    var canvas = r.data.canvases[ i ] = document.createElement( 'canvas' );  // eslint-disable-line no-undef
    r.data.contexts[ i ] = canvas.getContext( '2d' );
    canvas.setAttribute( 'style', '-webkit-user-select: none; -moz-user-select: -moz-none; user-select: none; -webkit-tap-highlight-color: rgba(0,0,0,0); outline-style: none;' + ( is.ms() ? ' -ms-touch-action: none; touch-action: none; ' : '' ) );
    canvas.style.position = 'absolute';
    canvas.setAttribute( 'data-id', 'layer' + i );
    canvas.style.zIndex = String( CRp.CANVAS_LAYERS - i );
    r.data.canvasContainer.appendChild( canvas );

    r.data.canvasNeedsRedraw[ i ] = false;
  }
  r.data.topCanvas = r.data.canvases[0];

  r.data.canvases[ CRp.NODE ].setAttribute( 'data-id', 'layer' + CRp.NODE + '-node' );
  r.data.canvases[ CRp.SELECT_BOX ].setAttribute( 'data-id', 'layer' + CRp.SELECT_BOX + '-selectbox' );
  r.data.canvases[ CRp.DRAG ].setAttribute( 'data-id', 'layer' + CRp.DRAG + '-drag' );

  for( var i = 0; i < CRp.BUFFER_COUNT; i++ ){
    r.data.bufferCanvases[ i ] = document.createElement( 'canvas' );  // eslint-disable-line no-undef
    r.data.bufferContexts[ i ] = r.data.bufferCanvases[ i ].getContext( '2d' );
    r.data.bufferCanvases[ i ].style.position = 'absolute';
    r.data.bufferCanvases[ i ].setAttribute( 'data-id', 'buffer' + i );
    r.data.bufferCanvases[ i ].style.zIndex = String( -i - 1 );
    r.data.bufferCanvases[ i ].style.visibility = 'hidden';
    //r.data.canvasContainer.appendChild(r.data.bufferCanvases[i]);
  }

  r.pathsEnabled = true;

  let emptyBb = makeBoundingBox();

  let getStyleKey = ele => ele[0]._private.nodeKey;
  let drawElement = (context, ele, bb, scaledLabelShown, useEleOpacity) => r.drawElement( context, ele, bb, false, false, useEleOpacity );
  let getElementBox = ele => { ele.boundingBox(); return ele[0]._private.bodyBounds; };
  let backgroundTimestampHasChanged = ele => {
    let _p = ele[0]._private;
    let same = _p.oldBackgroundTimestamp === _p.backgroundTimestamp;

    return !same;
  };

  let getLabelKey = ele => ele[0]._private.labelStyleKey;
  let getSourceLabelKey = ele => ele[0]._private.sourceLabelStyleKey;
  let getTargetLabelKey = ele => ele[0]._private.targetLabelStyleKey;
  let drawLabel = (context, ele, bb, scaledLabelShown, useEleOpacity) => r.drawElementText( context, ele, bb, scaledLabelShown, 'main', useEleOpacity );
  let drawSourceLabel = (context, ele, bb, scaledLabelShown, useEleOpacity) => r.drawElementText( context, ele, bb, scaledLabelShown, 'source', useEleOpacity );
  let drawTargetLabel = (context, ele, bb, scaledLabelShown, useEleOpacity) => r.drawElementText( context, ele, bb, scaledLabelShown, 'target', useEleOpacity );
  let getLabelBox = ele => { ele.boundingBox(); return ele[0]._private.labelBounds.main || emptyBb; };
  let getSourceLabelBox = ele => { ele.boundingBox(); return ele[0]._private.labelBounds.source || emptyBb; };
  let getTargetLabelBox = ele => { ele.boundingBox(); return ele[0]._private.labelBounds.target || emptyBb; };
  let isLabelVisibleAtScale = (ele, scaledLabelShown) => scaledLabelShown;

  let eleTxrCache = r.data.eleTxrCache = new ElementTextureCache( r, {
    getKey: getStyleKey,
    doesEleInvalidateKey: backgroundTimestampHasChanged,
    drawElement: drawElement,
    getBoundingBox: getElementBox,
    allowEdgeTxrCaching: false,
    allowParentTxrCaching: false
  } );

  let lblTxrCache = r.data.lblTxrCache = new ElementTextureCache( r, {
    getKey: getLabelKey,
    drawElement: drawLabel,
    getBoundingBox: getLabelBox,
    isVisible: isLabelVisibleAtScale
  } );

  let slbTxrCache = r.data.slbTxrCache = new ElementTextureCache( r, {
    getKey: getSourceLabelKey,
    drawElement: drawSourceLabel,
    getBoundingBox: getSourceLabelBox,
    isVisible: isLabelVisibleAtScale
  } );

  let tlbTxrCache = r.data.tlbTxrCache = new ElementTextureCache( r, {
    getKey: getTargetLabelKey,
    drawElement: drawTargetLabel,
    getBoundingBox: getTargetLabelBox,
    isVisible: isLabelVisibleAtScale
  } );

  let lyrTxrCache = r.data.lyrTxrCache = new LayeredTextureCache( r );

  r.onUpdateEleCalcs(function invalidateTextureCaches( willDraw, eles ){
    // each cache should check for sub-key diff to see that the update affects that cache particularly
    eleTxrCache.invalidateElements( eles );
    lblTxrCache.invalidateElements( eles );
    slbTxrCache.invalidateElements( eles );
    tlbTxrCache.invalidateElements( eles );

    // any change invalidates the layers
    lyrTxrCache.invalidateElements( eles );

    // update the old bg timestamp so diffs can be done in the ele txr caches
    for( let i = 0; i < eles.length; i++ ){
      let _p = eles[i]._private;

      _p.oldBackgroundTimestamp = _p.backgroundTimestamp;
    }
  });

  let refineInLayers = reqs => {
    for( var i = 0; i < reqs.length; i++ ){
      lyrTxrCache.enqueueElementRefinement( reqs[i].ele );
    }
  };

  eleTxrCache.onDequeue(refineInLayers);
  lblTxrCache.onDequeue(refineInLayers);
  slbTxrCache.onDequeue(refineInLayers);
  tlbTxrCache.onDequeue(refineInLayers);
}

CRp.redrawHint = function( group, bool ){
  var r = this;

  switch( group ){
    case 'eles':
      r.data.canvasNeedsRedraw[ CRp.NODE ] = bool;
      break;
    case 'drag':
      r.data.canvasNeedsRedraw[ CRp.DRAG ] = bool;
      break;
    case 'select':
      r.data.canvasNeedsRedraw[ CRp.SELECT_BOX ] = bool;
      break;
  }
};

// whether to use Path2D caching for drawing
var pathsImpld = typeof Path2D !== 'undefined';

CRp.path2dEnabled = function( on ){
  if( on === undefined ){
    return this.pathsEnabled;
  }

  this.pathsEnabled = on ? true : false;
};

CRp.usePaths = function(){
  return pathsImpld && this.pathsEnabled;
};

CRp.setImgSmoothing = function( context, bool ){
  if( context.imageSmoothingEnabled != null ){
    context.imageSmoothingEnabled = bool;
  } else {
    context.webkitImageSmoothingEnabled = bool;
    context.mozImageSmoothingEnabled = bool;
    context.msImageSmoothingEnabled = bool;
  }
};

CRp.getImgSmoothing = function( context ){
  if( context.imageSmoothingEnabled != null ){
    return context.imageSmoothingEnabled;
  } else {
    return context.webkitImageSmoothingEnabled || context.mozImageSmoothingEnabled || context.msImageSmoothingEnabled;
  }
};

CRp.makeOffscreenCanvas = function(width, height){
  let canvas;

  if( typeof OffscreenCanvas !== typeof undefined ){
    canvas = new OffscreenCanvas(width, height);
  } else {
    canvas = document.createElement('canvas'); // eslint-disable-line no-undef
    canvas.width = width;
    canvas.height = height;
  }

  return canvas;
};

[
  arrowShapes,
  drawingElements,
  drawingEdges,
  drawingImages,
  drawingLabelText,
  drawingNodes,
  drawingRedraw,
  drawingShapes,
  exportImage,
  nodeShapes
].forEach( function( props ){
  util.extend( CRp, props );
} );

export default CR;
