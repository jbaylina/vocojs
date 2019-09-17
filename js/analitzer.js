/*jslint node: true , browser: true */
/*global window */
"use strict";

var analizerCtx;
var canvasWidth;
var canvasHeight;

function updateAnalizerErr() {
    var i;
    var x,y,m,lm;
    var voco = window.voco;

    if (!analizerCtx) {
        var canvas = document.getElementById("analizer");
        canvasWidth = canvas.width;
        canvasHeight = canvas.height;
        analizerCtx = canvas.getContext('2d');
    }


    analizerCtx.fillStyle = "rgba(0,0,0,1)";
    analizerCtx.fillRect(0, 0, canvasWidth, canvasHeight);

    if (!voco.packetDetector.lastPacket) return;

    for (i=0; i< voco.config.N_FRAMES_PACKET * voco.config.usedChannels.length /2; i++)  {
        var p = voco.randomPerm.convert[i];
        var sgood = (i & 1) ? 0.5 : 0;
        var srx = voco.packetDetector.lastPacket[p];
        var err = Math.abs(voco.circ.err(srx, sgood)) *2;
        var ch = p % voco.config.usedChannels.length;
        var fr = Math.floor(p / voco.config.usedChannels.length);
        var ox = (canvasWidth / (voco.config.N_FRAMES_PACKET *2)) * ( 1 + 2*fr);
        var oy = canvasHeight - (canvasHeight / (voco.config.usedChannels.length *2)) * ( 0.1 + 2*ch);
        var h100 = 1 * canvasHeight / voco.config.usedChannels.length;
        var w100 = 1 * canvasWidth / voco.config.N_FRAMES_PACKET;

        analizerCtx.fillStyle = "#FF0000";
        analizerCtx.fillRect(ox - w100/2, oy- err*h100, w100, err*h100);
        analizerCtx.fillStyle = "#00FF00";
        analizerCtx.fillRect(ox - w100/2, oy-h100, w100, (1-err)*h100);
//      analizerCtx.strokeRect(ox - w100/2, oy- h100, w100, h100);
    }

//  rafID = window.requestAnimationFrame( updateAnalizer );
}
