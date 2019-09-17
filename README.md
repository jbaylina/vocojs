# Vocojs

## INTRODUCTION

Vocojs is a Javascript library that Encodes and Decodes a 32bytes or Less packet
into a  to a sound.

## INSTALL

### Regular web.

Just download the build/voco.js and import it into your project.

### Bower

    bower install vocojs

## USAGE

### Transmit a sound


#### Transmit a string:

    vocojs.txString("Hollo World!");

#### Transmit binary:

    vocojs.txBin([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x20, 0x57, 0x6f, 0x72, 0x6c, 0x64, 0x0d, 0a]);

#### Receive string

    vocojs.onRxString(function(msg) {
        console.log(msg);
    });

#### Receive binary

    vocojs.onRxBin(function(bMsg) {
        for (var i=0; i<bMsg.length; i++) {
            console.log(bMsg[i].toString(16));
        }
    });

#### Initialization

The library initializes automaticaly the ferst time you transmit/register for receive,

But if you want to initialize before sending/registering for reception, you can call:

    vocojs.initTx();
    vocojs.initRx();

## NOTES

You will have to accept permitions for the microphon to capture audio.
If you serve the web that uses the library in a https the user will not have.
to accept it every time that connects to the page.

Most mobiles can accept transmiting but not receiving.

Hope that the UserMedia API will be implemented in all navegators.

## HOW DOES IT WORK

1.- Data is converted to a 256 bits.
2.- A 32 bits CRC and a 16bit packet id (consecutive) is added to the packet. (304bits)
3.- a 1/6 CCSDS Turbocode is aplied. ie 1520 redundant bits are added for Error Correction. (1824bits)
4.- Those bits are sparsed in a known pseudorandom permutation over the white squares of a chess board of 48x76
5.- In the black squeres we put an alternated 0/1 (Syncronitzation and reference)
6.- We construct an 48 frames plus one preamble and one postable with random bits.
7.- Each frame has 512 samples. We will sample in 256its chunks so we have 128 channels. We construct this frame by applyinf a FFT taking only 76/128 chanels. The phase of the used channels is shifted 0º or 180º respecte the same chanel of the last frame depending if we encode a 0 or a 1.  (OFDM encoding)

8.- We take 256bits chunks every 128bits So at list two out of the four fit in one freme.
9.- We do the IFFT of each chunk and calculate the phase respect the previos frame.
10.- We take in account the error phase shift between the previous and the next
frame and the adjacent channels to calculate a probability of 1 or 0. Or whats the same,
we use the readed value of the black squares that are known to compensate and determine
the value of the what square.
11.- If 1824 + 150 sync bits match, we considere it as a possible packet.
12.- We try to error correct the data (Turbo Code decoder)
13.- If the CRC match we considere a received packet.
14.- If we don't have deivered this packet (packet id) recently, we deliver the packet.

Actual bitrate = 256 / (50*512 / 44100)  = 441bit/s

This speed could easily be improved using less redundant ECC code, more channels or a QAM en each OFDM channel.
Also, the 1/2 overhead of the sampling system could be reduced, and we could use less sync bytes. But the objective of this project was to transmit 256 bit in about half second the most reliable that we can and in Javascript.







