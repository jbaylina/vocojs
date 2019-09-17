/*jslint node: true , browser: true */
/*global window */
"use strict";

var config = require('./config.js');
var SoundDriver = require('./sound_driver.js');
var RandomPerm = require('./random_perm.js');
var OFDM = require('./ofdm.js');
var Packetizer = require('./packetizer.js');
var TurboCode = require('./turbocode.js');
var FLSInterleaver = require('./flsinterleaver.js');
var IdCRC = require('./idcrc.js');
var Utf8Utils = require('./utf8.js');
var Predictor = require('./predictor.js');
var circ = require('./circ.js');

var VocoJS = function() {

    var self = this;
    var txInitialized = false;
    var rxInitialized = false;
    this.randomPerm = new RandomPerm(config.N_FRAMES_PACKET * config.usedChannels.length);
    this.tcPerm = new FLSInterleaver(304);

    var rxCallBacksBin = [];
    var rxCallBacksString = [];

    this.config = config;
    this.circ = circ;

    this.initTx = function(cb) {
        if (!cb) cb = function(){};
        if (txInitialized) return cb();

        SoundDriver.createSoundPlayer(function(err, sp) {
            self.soundPlayer = sp;
            try {
                self.ofdmCoder = new OFDM.Encoder(config.N_PREAMBLE_FRAMES, config.N_POSTAMBLE_FRAMES, config.FDIV, config.usedChannels, self.soundPlayer);
                self.packetGenerator = new Packetizer.PacketGenerator(config.usedChannels.length, config.N_FRAMES_PACKET, self.randomPerm, self.ofdmCoder);
            //  ldpc=new LDPCEncoder("alist/l1848_128.alist", packetGenerator);

                self.eccEncoder = new TurboCode.Encoder(config.NUMS1, config.DEN1, config.NUMS2, config.DEN2, self.tcPerm, self.packetGenerator);

                self.idCrcEncoder = new IdCRC.Encoder(self.eccEncoder);

            } catch (err) {
                cb(err);
            }
            txInitialized= true;
            cb();
        });
    };
    this.initRx = function(cb) {
        if (!cb) cb = function(){};
        if (rxInitialized) return cb();


        this.packetReceiver = {
            processData: function(packet) {
                var stringReceived = Utf8Utils.decode(packet);
                console.log("Packet received: "+ stringReceived);
                rxCallBacksBin.forEach(function(cb) {
                    cb(packet);
                });
                rxCallBacksString.forEach(function(cb) {
                    cb(stringReceived);
                });
            }
        };



        this.idCrcDecoder = new IdCRC.Decoder(this.packetReceiver);


        this.eccDecoder = new TurboCode.Decoder(config.NUMS1, config.DEN1, config.NUMS2, config.DEN2, this.tcPerm, 10, this.idCrcDecoder);

        this.predictor = new Predictor(config.usedChannels.length, config.N_FRAMES_PACKET, this.randomPerm, this.eccDecoder);

        this.packetDetector = new Packetizer.PacketDetector(config.usedChannels.length, config.N_FRAMES_PACKET, this.randomPerm, this.predictor);
        this.ofdmDecoder = new OFDM.Decoder(config.FDIV, config.usedChannels, this.packetDetector);
        rxInitialized = true;
        this.receptor = SoundDriver.createSoundGrabber(config.N_BUFF_IN, config.FDIV, this.ofdmDecoder, cb);
    };
    this.onRxBin = function(rxCallBack, cb) {
        if (!cb) cb = function(){};

        var pos = rxCallBacksBin.length;
        rxCallBacksBin[pos] = rxCallBack;
        this.initRx(cb);

        return function() {
            delete rxCallBacksBin[pos];
        };
    };

    this.onRxString = function(rxCallBack, cb) {
        if (!cb) cb = function(){};

        var pos = rxCallBacksString.length;
        rxCallBacksString[pos] = rxCallBack;
        this.initRx(cb);

        return function() {
            delete rxCallBacksString[pos];
        };
    };

    this.txString = function(data, cb) {
            var rawData = Utf8Utils.encode(data);
            self.txBin(rawData, cb);
    };
    this.txBin = function(data, cb) {
        this.initTx(function(err) {
            if (err) return cb(err);
            self.idCrcEncoder.processData(data);
        });
    };
    this.txSilence = function() {
        this.initTx(function(err) {
            var dataFrame;
            var L = (config.N_PREAMBLE_FRAMES + config.N_FRAMES_PACKET +  config.N_POSTAMBLE_FRAMES)* config.FDIV * 4;

            var outL = new Array( L );

            var i;
            for (i=0; i<L; i++) {
                outL[i]=0;
            }

            self.soundPlayer.processData(outL);
        });
    };
};

window.vocojs = new VocoJS();



