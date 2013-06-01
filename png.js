Number.prototype.toUInt=function(){ return this<0?this+4294967296:this; };
Number.prototype.bytes32=function(){ return [(this>>>24)&0xff,(this>>>16)&0xff,(this>>>8)&0xff,this&0xff]; };
Number.prototype.bytes16sw=function(){ return [this&0xff,(this>>>8)&0xff]; };

Array.prototype.adler32=function(start,len){
		switch(arguments.length){ 
			case 0:start=0; 
			case 1:len=this.length-start; 
		}
		var a=1,b=0;
		for(var i=0;i<len;i++){
			a = (a+this[start+i])%65521; b = (b+a)%65521;
		}
		return ((b << 16) | a).toUInt();
};

Array.prototype.crc32=function(start,len){
	switch(arguments.length){ case 0:start=0; case 1:len=this.length-start; }
	var table=arguments.callee.crctable;
	if(!table){
		table=[];
		var c;
		for (var n = 0; n < 256; n++) {
			c = n;
			for (var k = 0; k < 8; k++)
					c = c & 1?0xedb88320 ^ (c >>> 1):c >>> 1;
			table[n] = c.toUInt();
		}
		arguments.callee.crctable=table;
	}
	var c = 0xffffffff;
	for (var i = 0; i < len; i++)
		c = table[(c ^ this[start+i]) & 0xff] ^ (c>>>8);

	return (c^0xffffffff).toUInt();
};

String.prototype.toByteStream=function(){
	var s = []
	if (this.length%2 == 1) this = this + "0"
	for (var i = 0; i < this.length; i+=2){
		s.push(parseInt(this[i] + this[i+1], 16)&0xff);
	}
	return s;
}


var toDataURLExample=function(w, h){
	var imageData=Array.prototype.slice.call(this.getContext("2d").getImageData(0,0,this.width,this.height).data);
	//var w=this.width;
	//var h=this.height;

	//=====IHDR
	var stream=[
		0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,
		0x00,0x00,0x00,0x0d,0x49,0x48,0x44,0x52
	];
	Array.prototype.push.apply(stream, w.bytes32() );
	Array.prototype.push.apply(stream, h.bytes32() );
	stream.push(0x08,0x06,0x00,0x00,0x00);
	Array.prototype.push.apply(stream, stream.crc32(12,17).bytes32() );

	//=====IDAT
	var len=h*(w*4+1);
	for(var y=0;y<h;y++)
		imageData.splice(y*(w*4+1),0,0);
	var blocks=Math.ceil(len/32768); //32768 - max block length?

	stream = stream.concat( (len+ 5*blocks +6).bytes32() ); //length

	stream.push(0x49,0x44,0x41,0x54,0x78,0x01);//IHDR, ZLIB flags

	var crcStart=stream.length;
	var crcLen=(len+5*blocks+6+4);
	for(var i=0;i<blocks;i++){
		var blockLen=Math.min(32768,len-(i*32768)); //last block length
		stream.push(i==(blocks-1)?0x01:0x00); //end block or not
		Array.prototype.push.apply(stream, blockLen.bytes16sw() ); //blocklen
		Array.prototype.push.apply(stream, (~blockLen).bytes16sw() ); //blocklencomplement
		var id=imageData.slice(i*32768,i*32768+blockLen); //splice part of image data
		Array.prototype.push.apply(stream, id ); //write it raw
	}

	Array.prototype.push.apply(stream, imageData.adler32().bytes32() ); //make adler
	Array.prototype.push.apply(stream, stream.crc32(crcStart, crcLen).bytes32() );

	//=====IEND
	stream.push(0x00,0x00,0x00,0x00,0x49,0x45,0x4e,0x44);
	Array.prototype.push.apply(stream, stream.crc32(stream.length-4, 4).bytes32() );
	return "data:image/png;base64,"+btoa(stream.map(function(c){ return String.fromCharCode(c); }).join(''));
};



var PNG = function(opts){
	this.options = {};
	import$(this.options, PNG.defaults);
	import$(this.options, opts);
	import$(this, {
		data: null, //bitmap data stream
		chunks: null,
		width: 5,
		height: 5
	});
}

import$(PNG, {
	defaults: {		
		bitDepth: 0x08,
		colorType: 0x06, //3 - Indexed, 6 — trueColor with alpha
		compressMethod: 0x00, 
		filterMethod: 0x00, //0 - No filtering
		interlaceMethod: 0x00
	}
});

import$(PNG.prototype, {
	raw: function(){
		arguments.length ? this.setRaw.apply(this, arguments) : this.getRaw.apply(this, arguments);
	},

	getRaw: function(){
		return this.getStream().map(function(c){ c = c||0; return (c<15?"0"+c.toString(16): c.toString(16)); }).join('')
	},

	getStream: function(){		
		var self = this, o = self.options;

		//IHDR
		var s = [
			0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a, //BOF
			0x00,0x00,0x00,0x0d,0x49,0x48,0x44,0x52 //Length, IHDR
		];
		s = s.concat((+self.width).bytes32(), (+self.height).bytes32());
		s = s.concat(o.bitDepth, o.colorType, o.compressMethod, o.filterMethod, o.interlaceMethod);
		s = s.concat(s.crc32(12,17).bytes32());

		//PLTE
		//s = s.concat(self.chunks.PLTE.toStream());

		//tRNS
		//s = s.concat(self.chunks.tRNS.toStream());

		//IDAT		
		var dataStream = self.data.toByteStream();
		var w = self.width, h = self.height,
			l = 4

		var len=h*(w*4+1);
		for(var y=0;y<h;y++)
			dataStream.splice(y*(w*4+1),0,0); //insert zero chunk in every row?

		var blocks=Math.ceil(len/32768); //32768 - max block length?

		s = s.concat( (len+ 5*blocks +6).bytes32() ); //length
		s = s.concat(0x49,0x44,0x41,0x54) //IDAT

		//zlib
		//http://www.w3.org/TR/2003/REC-PNG-20031110/#10CompressionCM0
		//http://tools.ietf.org/html/rfc1950#page-4	
		s = s.concat(0x78,0x01) //7 - 2^7, 8 - deflate method, 01 - fastest compression, no dict, checkflag
		//s = s.concat(0x01, (0x02).bytes16sw(), (~0x02).bytes16sw(), dataStream) //01 - end-block header, len, nlen, rawdata
		
		var crcStart=s.length;
		var crcLen=(len+5*blocks+6+4);
		
		for(var i=0;i<blocks;i++){
			var blockLen=Math.min(32768,len-(i*32768)); //last block length
			s.push(i==(blocks-1)?0x01:0x00); //end block or not
			Array.prototype.push.apply(s, blockLen.bytes16sw() ); //blocklen
			Array.prototype.push.apply(s, (~blockLen).bytes16sw() ); //blocklencomplement
			var id=dataStream.slice(i*32768,i*32768+blockLen); //splice part of image data
			Array.prototype.push.apply(s, id ); //write it raw
		}

		s = s.concat( dataStream.adler32().bytes32() ); //make adler
		s = s.concat( s.crc32(crcStart, crcLen).bytes32() );


		//IEND
		s = s.concat(0x00,0x00,0x00,0x00,0x49,0x45,0x4e,0x44);//Length, IEND
		s = s.concat(s.crc32(s.length-4, 4).bytes32());
		return s;
	},

	set: function(settings){
		import$(this, settings);
	},

	toDataURL: function(){
		var self = this, o = self.options;
		var dataURI = "data:image/png;base64,"+ btoa( self.getStream().map(function(c){ return String.fromCharCode(c); }).join('') );
		return dataURI;
	}
});



//js cribbles
function import$(a, b){
	for (var key in b){
		a[key] = b[key];
	}
	return a;
}