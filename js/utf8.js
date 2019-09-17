/*jslint node: true , browser: true */
/*global window */
"use strict";

//************************************************************************************
// UTF-8 Encoding helpers.
// based on the code at http://www.webtoolkit.info
//************************************************************************************
var Utf8Utils= function() {
    function _encode(stringToEncode, insertBOM) {
        stringToEncode = stringToEncode.replace(/\r\n/g,"\n");
        var utftext = [];
        if( insertBOM === true )  {
            utftext[0]=  0xef;
            utftext[1]=  0xbb;
            utftext[2]=  0xbf;
        }

        for (var n = 0; n < stringToEncode.length; n++) {

            var c = stringToEncode.charCodeAt(n);

            if (c < 128) {
                utftext[utftext.length]= c;
            }
            else if((c > 127) && (c < 2048)) {
                utftext[utftext.length]= (c >> 6) | 192;
                utftext[utftext.length]= (c & 63) | 128;
            }
            else {
                utftext[utftext.length]= (c >> 12) | 224;
                utftext[utftext.length]= ((c >> 6) & 63) | 128;
                utftext[utftext.length]= (c & 63) | 128;
            }

        }
        return utftext;
    }

    var obj= {
        /**
         * Encode javascript string as utf8 byte array
         */
        encode : function(stringToEncode) {
            return _encode( stringToEncode, false);
        },

        /**
         * Encode javascript string as utf8 byte array, with a BOM at the start
         */
        encodeWithBOM: function(stringToEncode) {
            return _encode(stringToEncode, true);
        },

        /**
         * Decode utf8 byte array to javascript string....
         */
        decode : function(dotNetBytes) {
            var result= "";
            var i= 0;
            var c=0, c1=0, c2=0;

            // Perform byte-order check.
            if( dotNetBytes.length >= 3 ) {
                if( (dotNetBytes[0] & 0xef) === 0xef && (dotNetBytes[1] & 0xbb) === 0xbb && (dotNetBytes[2] & 0xbf) === 0xbf ) {
                    // Hmm byte stream has a BOM at the start, we'll skip this.
                    i= 3;
                }
            }

            while( i < dotNetBytes.length ) {
                c= dotNetBytes[i]&0xff;

                if( c < 128 ) {
                    result+= String.fromCharCode(c);
                    i++;
                }
                else if( (c > 191) && (c < 224) ) {
                    if( i+1 >= dotNetBytes.length ) {
//                        throw "Un-expected encoding error, UTF-8 stream truncated, or incorrect";
                        i+=2;
                    } else {
                        c2= dotNetBytes[i+1]&0xff;
                        result+= String.fromCharCode( ((c&31)<<6) | (c2&63) );
                        i+=2;
                    }
                }
                else {
                    if( i+2 >= dotNetBytes.length  || i+1 >= dotNetBytes.length ) {
//                        throw "Un-expected encoding error, UTF-8 stream truncated, or incorrect";
                        i+=3;
                    } else {
                        c2= dotNetBytes[i+1]&0xff;
                        var c3= dotNetBytes[i+2]&0xff;
                        result+= String.fromCharCode( ((c&15)<<12) | ((c2&63)<<6) | (c3&63) );
                        i+=3;
                    }
                }
            }
            return result;
        }
    };
    return obj;
}();

module.exports = Utf8Utils;
