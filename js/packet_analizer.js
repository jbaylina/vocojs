function PacketAnalizer() {

	var self=this;

	self.infoPacketsReceived = [];

	this.purgeOld = function() {
		var t=new Date().getTime();
		while ((self.infoPacketsReceived.length>0) && ( self.infoPacketsReceived[0].timestamp - t > 1000)) self.infoPacketsReceived.shift();
	};

	this.processData = function(inL, of, t, nDetected) {
		var infoPacket = {
			timestamp: new Date().getTime(),
			t: t,
			nDetected: nDetected
		};

		var last = null;
		if (self.infoPacketsReceived.length>0) {
			last = self.infoPacketsReceived[ selfinfoPacketsReceived.length - 1 ];
		}
		if ((last) && (t-last.t<4) && (nDetected > last.nDetected)) {
			self.infoPacketsReceived[ self.infoPacketsReceived.length ] = infoPacket;
		} else {
			self.infoPacketsReceived.push( infoPacket );
		}

		self.purgeOld();
	};

	this.getMeasures = function() {
		self.purgeOld();

		var res = {};
		var t=new Date().getTime();
		var i=self.infoPacketsReceived.length-1;
		while ((i>=0)&&(t-self.infoPacketsReceived[i].timestamp<10)) i-=1;
		if (i>0) {
			res.pps = 1000 / (self.infoPacketsReceived[i].timestamp - self.infoPacketsReceived[i-1].timestamp);
			res.nDetected = self.infoPacketsReceived[i].nDetected;
		} else {
			res.pps=0;
			res.nDetected=0;
		}
		return res;
	};

	return self;
}