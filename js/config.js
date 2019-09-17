/*jslint node: true , browser: true */
/*global window */
"use strict";

/////// CONFIGURATION CONSTANTS
exports.N_BUFF_IN = 4096;
exports.FDIV=128;
exports.N_FRAMES_PACKET=48;


//var usedChannels=[2,3,5,7,11,13,17,19,23,29,31,37,41,43,47,53,59,61,67,71,73,79,83,89,97,101,103,107,109,113,127]; // 31
exports.usedChannels=[]; // 27
var i;
for (i=6; i<=82; i++) {
    exports.usedChannels.push(i);
}

exports.N_PREAMBLE_FRAMES= 1;
exports.N_POSTAMBLE_FRAMES= 1;
exports.LDPC_MAX_ITERS=500;


exports.NUMS1 = [ 0x19, 0xB, 0x15, 0x1F];
exports.DEN1 = 0x19;
exports.NUMS2 = [ 0xB, 0x1F];
exports.DEN2 = 0x19;

//// END CONSTANTS
