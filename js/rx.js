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
var N_BUFF_IN = 4096;

//// END CONSTANTS

var packetPainter;
var predictor;
var packetDetector;
var ofdmDecoder;

var randomPerm;

var idCrcDecoder;
var eccDecoder;
var tcPerm;



// WS3 audio related
var context;		// Audio contrxt
var srcAudio;		// the mic src


// Painting related varialbes
var canvasWidth, canvasHeight,analizerCtx;
var rafID=null;
var xx =0;


function addRx(S) {
	var list = document.getElementById('rx');
	var entry = document.createElement('li');
	entry.appendChild(document.createTextNode(S));
	list.appendChild(entry);

	var objDiv = document.getElementById("drx");
	objDiv.scrollTop = objDiv.scrollHeight;
}

function cancelAnalizerUpdates() {
    window.cancelAnimationFrame( rafID );
    rafID = null;
}

// Paint the module
function updateAnalizer() {
	var i, p;
	var x,y,m,lm;

    if (!analizerCtx) {
        var canvas = document.getElementById("analizer");
        canvasWidth = canvas.width;
        canvasHeight = canvas.height;
        analizerCtx = canvas.getContext('2d');
    }


	analizerCtx.fillStyle = "rgba(0,0,0,1)";
    analizerCtx.fillRect(0, 0, canvasWidth, canvasHeight);

    if (!packetDetector.lastPacket) return;

    var avgMod =0;
    var minMod = 100000;
    var maxMod = -100000;
	for (i=0; i< N_FRAMES_PACKET * usedChannels.length; i++)  {
		avgMod += packetDetector.lastPacketMod[i];
		if (packetDetector.lastPacketMod[i] < minMod) {
			minMod = packetDetector.lastPacketMod[i];
		}
		if (packetDetector.lastPacketMod[i] > maxMod) {
			maxMod = packetDetector.lastPacketMod[i];
		}
	}

	avgMod=avgMod / (N_FRAMES_PACKET * usedChannels.length);

	var maxErr = Math.max(Math.abs(minMod - avgMod), Math.abs(maxMod-avgMod));


	for (i=0; i< N_FRAMES_PACKET * usedChannels.length; i++)  {
		p = randomPerm.convert[i];
		var err = (packetDetector.lastPacketMod[p] - avgMod) / maxErr;
		var ch = p % usedChannels.length;
		var fr = Math.floor(p / usedChannels.length);
		var ox = (canvasWidth / (N_FRAMES_PACKET *2)) * ( 1 + 2*fr);
		var oy = canvasHeight - (canvasHeight / (usedChannels.length *2)) * ( 0.1 + 2*ch);
		var h100 = 1 * canvasHeight / usedChannels.length;
		var w100 = 1 * canvasWidth / N_FRAMES_PACKET;


		if (err>0) {
			analizerCtx.fillStyle = "#00FF00";
			analizerCtx.fillRect(ox - w100/2, oy-h100/2- err*h100, w100, err*h100);
		} else {
			analizerCtx.fillStyle = "#FF0000";
			analizerCtx.fillRect(ox - w100/2, oy-h100/2, w100, -err*h100);
		}

//		analizerCtx.strokeRect(ox - w100/2, oy- h100, w100, h100);
	}

//	rafID = window.requestAnimationFrame( updateAnalizer );
}

function updateAnalizerErr() {
	var i;
	var x,y,m,lm;

    if (!analizerCtx) {
        var canvas = document.getElementById("analizer");
        canvasWidth = canvas.width;
        canvasHeight = canvas.height;
        analizerCtx = canvas.getContext('2d');
    }


	analizerCtx.fillStyle = "rgba(0,0,0,1)";
    analizerCtx.fillRect(0, 0, canvasWidth, canvasHeight);

    if (!packetDetector.lastPacket) return;

	for (i=0; i< N_FRAMES_PACKET * usedChannels.length /2; i++)  {
		var p = randomPerm.convert[i];
		var sgood = (i & 1) ? 0.5 : 0;
		var srx = packetDetector.lastPacket[p];
		var err = Math.abs(circ_err(srx, sgood)) *2;
		var ch = p % usedChannels.length;
		var fr = Math.floor(p / usedChannels.length);
		var ox = (canvasWidth / (N_FRAMES_PACKET *2)) * ( 1 + 2*fr);
		var oy = canvasHeight - (canvasHeight / (usedChannels.length *2)) * ( 0.1 + 2*ch);
		var h100 = 1 * canvasHeight / usedChannels.length;
		var w100 = 1 * canvasWidth / N_FRAMES_PACKET;

		analizerCtx.fillStyle = "#FF0000";
		analizerCtx.fillRect(ox - w100/2, oy- err*h100, w100, err*h100);
		analizerCtx.fillStyle = "#00FF00";
		analizerCtx.fillRect(ox - w100/2, oy-h100, w100, (1-err)*h100);
//		analizerCtx.strokeRect(ox - w100/2, oy- h100, w100, h100);
	}

//	rafID = window.requestAnimationFrame( updateAnalizer );
}

function PacketPainter() {
	var self=this;
	self.packet=null;
	self.processData = function(packet, acc) {
		var S = Utf8Utils.decode(packet);
		console.log("Packet received: "+ S);
		addRx(S);
		updateAnalizerErr();
	};
	return self;
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


// Mount the decodig chain
	randomPerm = new RandomPerm(N_FRAMES_PACKET * usedChannels.length);

	packetPainter = new PacketPainter();

	idCrcDecoder = new IdCRCDecoder(packetPainter);


//	ldpcDecoder = new LDPCDecoder("alist/l1848_128.alist", idCrcDecoder);
	tcPerm = new FLSInterleaver(304);
	eccDecoder = new TCDecoder(NUMS1, DEN1, NUMS2, DEN2, tcPerm, 10, idCrcDecoder);

	predictor = new Predictor(usedChannels.length, N_FRAMES_PACKET, randomPerm, eccDecoder);

	packetDetector = new PacketDetector(usedChannels.length, N_FRAMES_PACKET, randomPerm, predictor);
	ofdmDecoder = new OfdmDecoder(FDIV, usedChannels, packetDetector);

	receptor = context.createScriptProcessor(N_BUFF_IN, 2, 2);
	receptor.onaudioprocess = function(e) {
		var of, bf, i, j;
		var inL = e.inputBuffer.getChannelData(0);
		for (of= 0 ; of<N_BUFF_IN; of+=FDIV) {
			ofdmDecoder.processData(inL,of);
		}

	};

	if (!navigator.getUserMedia)
		navigator.getUserMedia = navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
	if (!navigator.cancelAnimationFrame)
		navigator.cancelAnimationFrame = navigator.webkitCancelAnimationFrame || navigator.mozCancelAnimationFrame;
	if (!navigator.requestAnimationFrame)
		navigator.requestAnimationFrame = navigator.webkitRequestAnimationFrame || navigator.mozRequestAnimationFrame;

// Configure and set W3 ctx

	navigator.getUserMedia({audio:true}, function(stream) {

		audioInput = context.createMediaStreamSource(stream);
		audioInput.connect(receptor);

		zeroGain = context.createGain();
		zeroGain.gain.value = 0.0;
		receptor.connect( zeroGain );
		zeroGain.connect( context.destination );

	}, function(e) {
            alert('Error getting audio');
            console.log(e);
    });



	updateAnalizerErr();
}

window.addEventListener('load', init, false);
