/*jslint node: true , browser: true */
/*global window */
"use strict";



function createSoundPlayer(cb) {

    if (window.vocoSoundDriver) {
        return cb(null, window.vocoSoundDriver);
    }

    var sp = {};

    var context;
    try {
        // Fix up for prefixing
        window.AudioContext = window.AudioContext||window.webkitAudioContext;
        context = new window.AudioContext();
    }
    catch(e) {
        console.log('Web Audio API is not supported in this browser' + e);
        cb(new Error('Web Audio API is not supported in this browser'));
    }


    sp.processData = function(inBuff) {
        var buff = context.createBuffer(2, inBuff.length, 44100);
        var outL = buff.getChannelData(0);
        var i;
        for (i=0; i<inBuff.length; i+=1) {
            outL[i] = inBuff[i];
        }

        var source = context.createBufferSource();
        source.buffer = buff;
        source.connect(context.destination);
        source.start(0);
    };

    var hidden, visibilityChange;
    if (typeof document.hidden !== "undefined") { // Opera 12.10 and Firefox 18 and later support
      hidden = "hidden";
      visibilityChange = "visibilitychange";
    } else if (typeof document.mozHidden !== "undefined") {
      hidden = "mozHidden";
      visibilityChange = "mozvisibilitychange";
    } else if (typeof document.msHidden !== "undefined") {
      hidden = "msHidden";
      visibilityChange = "msvisibilitychange";
    } else if (typeof document.webkitHidden !== "undefined") {
      hidden = "webkitHidden";
      visibilityChange = "webkitvisibilitychange";
    }

    document.addEventListener(visibilityChange, function() {
        if (document[hidden]) {
            console.log("onBlurTx");
            context.suspend();
        } else {
            console.log("onFocusTx");
            context.resume();
        }
    }, false);

/*
    window.addEventListener('blur', function() {
        console.log("onBlurTx");
        context.suspend();
    });

    window.addEventListener('focus', function() {
        console.log("onFocusTx");
        context.resume();
    });
*/
    cb(null, sp);
}


function createSoundGrabber(N_BUFF_IN, FDIV, processor, cb) {
    var context;
    var bytesReceived =0;
    var startTime = (new Date()).getTime();

    function printProcessor() {
        var now = (new Date()).getTime();
        console.log(bytesReceived*1000 / (now-startTime));
    }

    setInterval(printProcessor,3000);

    try {
        // Fix up for prefixing
        window.AudioContext = window.AudioContext||window.webkitAudioContext;
        context = new window.AudioContext();
    }
    catch(e) {
        console.log('Web Audio API is not supported in this browser' + e);
        window.alert('Web Audio API is not supported in this browser');
    }

    if (!navigator.getUserMedia)
        navigator.getUserMedia = navigator.mediaDevices.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
    if (!navigator.cancelAnimationFrame)
        navigator.cancelAnimationFrame = navigator.webkitCancelAnimationFrame || navigator.mozCancelAnimationFrame;
    if (!navigator.requestAnimationFrame)
        navigator.requestAnimationFrame = navigator.webkitRequestAnimationFrame || navigator.mozRequestAnimationFrame;


    var receptor = context.createScriptProcessor(N_BUFF_IN, 2, 2);
    receptor.onaudioprocess = function(e) {
        var of, bf, i, j;
        var inL = e.inputBuffer.getChannelData(0);
        for (of= 0 ; of<N_BUFF_IN; of+=FDIV) {
            processor.processData(inL,of);
        }
        bytesReceived += N_BUFF_IN;
//        console.log("rx");
    };

    var hidden, visibilityChange;
    if (typeof document.hidden !== "undefined") { // Opera 12.10 and Firefox 18 and later support
      hidden = "hidden";
      visibilityChange = "visibilitychange";
    } else if (typeof document.mozHidden !== "undefined") {
      hidden = "mozHidden";
      visibilityChange = "mozvisibilitychange";
    } else if (typeof document.msHidden !== "undefined") {
      hidden = "msHidden";
      visibilityChange = "msvisibilitychange";
    } else if (typeof document.webkitHidden !== "undefined") {
      hidden = "webkitHidden";
      visibilityChange = "webkitvisibilitychange";
    }


    document.addEventListener(visibilityChange, function() {
        if (document[hidden]) {
            console.log("onBlurRx");
            context.suspend();
        } else {
            console.log("onFocusRx");
            context.resume();
        }
    }, false);
/*
    window.addEventListener('blur', function() {
        console.log("onBlurRx");
        context.suspend();
    });

    window.addEventListener('focus', function() {
        console.log("onFocusRx");
        context.resume();
    });
*/

// Configure and set W3 ctx

    navigator.mediaDevices.getUserMedia({audio:true}).then(function(stream) {


        var audioInput = context.createMediaStreamSource(stream);
        audioInput.connect(receptor);


        var zeroGain = context.createGain();
        zeroGain.gain.value = 0.0;
        receptor.connect( zeroGain );
        zeroGain.connect( context.destination );

        window.inStream = stream;
        window.audioInput = audioInput;
        window.zeroGain = zeroGain;
        window.context = context;

        cb(null, receptor);
    }, function(err) {
        console.log(err);
        return cb(err);
    });
}

exports.createSoundPlayer = createSoundPlayer;
exports.createSoundGrabber = createSoundGrabber;

