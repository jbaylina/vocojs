var context;
var srcAudio;
var t=0.0;
var f=0;
var canvasWidth, canvasHeight,analizerCtx;
var rafID=null;
var vol=0;
var fRes=[];
var FDIV=64;
var oldBuff=[];
var ch=10;
var h=0;
var oldMeasure={real: [], imag: []};



function cancelAnalizerUpdates() {
    window.cancelAnimationFrame( rafID );
    rafID = null;
}

function updateAnalizer() {
	var i;
	var x,y,m,lm;

//	return;

	ch = parseInt(document.getElementById("ch").value,10);
    if (!analizerCtx) {
        var canvas = document.getElementById("analizer");
        canvasWidth = canvas.width;
        canvasHeight = canvas.height;
        analizerCtx = canvas.getContext('2d');
    }

	analizerCtx.fillStyle = "rgba(0,0,0,0.1)";
    analizerCtx.fillRect(0, 0, canvasWidth, canvasHeight);


	analizerCtx.strokeStyle = '#ffffff';
	analizerCtx.beginPath();
/*
    for (i=0; i<4; i++) {
		analizerCtx.moveTo(0, i*canvasHeight/4);
		analizerCtx.lineTo(canvasWidth, i*canvasHeight/4);
    }

    for (i=0; i<FDIV; i++) {
		analizerCtx.moveTo(i*canvasWidth/FDIV, 0);
		analizerCtx.lineTo(i*canvasWidth/FDIV, canvasHeight);
    }
*/
	analizerCtx.stroke();

	analizerCtx.fillStyle = "#00FF00";

	var BL=4096 / (FDIV *2);

	for (i=1; i<FDIV; i+=1) {
		for (j=0; j<BL; j+=1) {
			var c= fRes[i][j];

			y = ((j % 4) + 0.5) * canvasHeight/4 - c* canvasHeight/10;
			x = i * canvasWidth/FDIV + 5 + j* (canvasWidth/FDIV -10)/(BL);

//			analizerCtx.beginPath();
//			analizerCtx.arc(x,y,3,0,1 *Math.PI);
//			analizerCtx.closePath();
//			analizerCtx.fill();
			analizerCtx.fillRect(x-1,y-1,3,3);
		}
	}



/*
	analizerCtx.beginPath();
	analizerCtx.arc(x,y,3,0,2 *Math.PI);
	analizerCtx.closePath();
	analizerCtx.fill();
*/

/*
	analizerCtx.fillRect(canvasWidth /2 -10, (1 - vol)*canvasHeight, 20, vol*canvasHeight);
*/

/*
	var A=0.01;

	for (i=0; i<4096 / (FDIV *2); i++) {
    
		h = (h + 67) % 360;
		analizerCtx.fillStyle = "hsl(" + h + ",100%,50%)";

		m = Math.sqrt(fRes.real[i]*fRes.real[i] + fRes.imag[i]*fRes.imag[i]);
		lm = 80 + 20*Math.log(m)/Math.LN10;

		x = A*canvasHeight/2 * fRes.real[i]/m * lm;
		y = A*canvasHeight/2 * fRes.imag[i]/m * lm;

		x += canvasWidth / 8 + (i%4)*canvasWidth/4;

		y = canvasHeight/2 -y;

		analizerCtx.beginPath();
		analizerCtx.arc(x,y,3,0,1 *Math.PI);
		analizerCtx.closePath();
		analizerCtx.fill();
	}

*/

	rafID = window.requestAnimationFrame( updateAnalizer );
}

function init() {

	var i,j;
	var BL=4096 / (FDIV *2);
	for (i=0; i<FDIV; i++) {
		oldBuff[i]=0;
		fRes[i]=[];
		for (j=0;j <BL; j++) {
			oldMeasure.real[j*FDIV +i]=1;
			oldMeasure.imag[j*FDIV +i]=0;
		}
	}
	try {
		// Fix up for prefixing
		window.AudioContext = window.AudioContext||window.webkitAudioContext;
		context = new AudioContext();
	}
	catch(e) {
		alert('Web Audio API is not supported in this browser');
	}


	srcAudio = context.createScriptProcessor(4096, 0, 2);
	srcAudio.onaudioprocess = function(e) {
		var j;
		var outL = e.outputBuffer.getChannelData(0);
		var outR = e.outputBuffer.getChannelData(1);
		var fdata=new complex_array.ComplexArray(FDIV*4);
		//	f = 0.1*2000*((t/context.sampleRate) % 10);
		for (of = 0; of< 4096; of += FDIV*4) {
			fdata.real[0]=0;
			fdata.real[FDIV*2]=0;
			fdata.imag[0]=0;
			fdata.imag[FDIV*2]=0;
			for (j=0; j<FDIV*2; j++) {
				if (j%2 === 0) {
					fdata.real[j] = 0.5*FDIV*(1/FDIV)*(Math.random() > 0.5 ? 1 : -1);
					fdata.real[FDIV*4-j] = fdata.real[j];
				} else {
					fdata.real[j]=0;
					fdata.real[FDIV*4-j]=0;
				}
				if ((j>FDIV)||(j<1)) {
					fdata.real[j]=0;
					fdata.real[FDIV*4-j]=0;
				}
				fdata.imag[j] =0;
				fdata.imag[FDIV*4-j] =0;
			}

			var data = fdata.InvFFT();

			for (j=0; j<FDIV*4; j++) {
				outL[of+j] = data.real[j];
			}
		}
	};

	srcAudio.connect(context.destination);


	receptor = context.createScriptProcessor(4096, 2, 2);
	receptor.onaudioprocess = function(e) {
//		return;

		var of, bf, i, j;
		var inL = e.inputBuffer.getChannelData(0);
		bf =0;
		var data=new complex_array.ComplexArray(FDIV*2);
		for (of= -FDIV ; of<4096; of+=FDIV) {
			for (i=0; i<FDIV*2;i++) {
				data.real[i] = (of+i>=0) ? inL[of+i] : oldBuff[i];
//				data.imag[i] = data.real[i];
				data.imag[i] = 0;
			}
			var freq = data.FFT();

			for (i=1; i<FDIV; i++) {
				var ox, oy, nx, ny, c;
				ox = oldMeasure.real[ (bf % 4)*FDIV + i];
				oy = oldMeasure.imag[ (bf % 4)*FDIV + i];
				nx = freq.real[i];
				ny = freq.imag[i];

				c = (ox*nx + oy*ny) / (Math.sqrt(ox*ox +oy*oy) * Math.sqrt(nx*nx +ny*ny));
				fRes[i][bf] = c;

				oldMeasure.real[ (bf % 4)*FDIV + i] = nx;
				oldMeasure.imag[ (bf % 4)*FDIV + i] = ny;
			}

			bf +=1;
		}
		for (i=0; i<FDIV; i++) {
			oldBuff[i] = inL[4096-FDIV+i];
		}
	};

	if (!navigator.getUserMedia)
		navigator.getUserMedia = navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
	if (!navigator.cancelAnimationFrame)
		navigator.cancelAnimationFrame = navigator.webkitCancelAnimationFrame || navigator.mozCancelAnimationFrame;
	if (!navigator.requestAnimationFrame)
		navigator.requestAnimationFrame = navigator.webkitRequestAnimationFrame || navigator.mozRequestAnimationFrame;

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



	updateAnalizer();
}

window.addEventListener('load', init, false);
