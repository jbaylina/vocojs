/////// CONFIGURATION CONSTANTS
var N_BUFF_IN = 4096;
var FDIV=128;
var N_FRAMES_PACKET=48;


//var usedChannels=[2,3,5,7,11,13,17,19,23,29,31,37,41,43,47,53,59,61,67,71,73,79,83,89,97,101,103,107,109,113,127]; // 31
var usedChannels=[]; // 27
for (i=6; i<=82; i++) {
	usedChannels.push(i);
}

var N_PREAMBLE_FRAMES= 1;
var N_POSTAMBLE_FRAMES= 1;
var LDPC_MAX_ITERS=500;

/*
var NUMS1 = [ 0x19, 0xB, 0x15, 0x1F];
var DEN1 = 0x19;
var NUMS2 = [ 0xB,  0x1F];
var DEN2 = 0x19;
*/
var NUMS1 = [ 0x19, 0xB, 0x15, 0x1F];
var DEN1 = 0x19;
var NUMS2 = [ 0xB, 0x1F];
var DEN2 = 0x19;

//// END CONSTANTS


var context;

var randomPerm;
var soundPlayer;
var ofdmCoder;
var packetGenerator;
var tcPerm;
var eccEncoder;
var idCrcEncoder;

function txData() {
	var S= document.getElementById("txdata").value;
	idCrcEncoder.processData(Utf8Utils.encode(S));
}

function SoundPlayer() {
	var self=this;
	self.processData = function(inBuff) {
		var buff = context.createBuffer(2, inBuff.length, 44100);
		var outL = buff.getChannelData(0);
		for (i=0; i<inBuff.length; i+=1) {
			outL[i] = inBuff[i];
		}

		var source = context.createBufferSource();
		source.buffer = buff;
		source.connect(context.destination);
		source.start(0);
	};
}

function init() {

	try {
		// Fix up for prefixing
		window.AudioContext = window.AudioContext||window.webkitAudioContext;
		context = new AudioContext();
	}
	catch(e) {
		alert('Web Audio API is not supported in this browser');
	}

	randomPerm = new RandomPerm(N_FRAMES_PACKET * usedChannels.length);

	soundPlayer = new SoundPlayer();
	ofdmCoder = new OfdmEncoder(N_PREAMBLE_FRAMES, N_POSTAMBLE_FRAMES, FDIV, usedChannels, soundPlayer);
	packetGenerator = new PacketGenerator(usedChannels.length, N_FRAMES_PACKET, randomPerm, ofdmCoder);
//	ldpc=new LDPCEncoder("alist/l1848_128.alist", packetGenerator);

	tcPerm = new FLSInterleaver(304);
	eccEncoder = new TCEncoder(NUMS1, DEN1, NUMS2, DEN2, tcPerm, packetGenerator);

	idCrcEncoder = new IdCRCEncoder(eccEncoder);

/*
	window.setInterval(function() {
		var i;
		var buff = [];
		idCrcEncoder.processData(Utf8Utils.encode("123456789-123456789-123456789-12"));
	}, 4000); */
}

/*
function playSound() {
	var buff = context.createBuffer(1, FDIV*4*(N_FRAMES_PACKET+N_PREAMBLE_FRAMES), 44100);
	var outL = buff.getChannelData(0);
	for (i=0; i<FDIV*4*(N_FRAMES_PACKET+N_PREAMBLE_FRAMES); i+=1) {
		outL[i] = Math.sin(2*Math.PI*1000*i/44100);
	}

	var source = context.createBufferSource();
	source.buffer = buff;
	source.connect(context.destination);
	source.start(0);
} */

window.addEventListener('load', init, false);
