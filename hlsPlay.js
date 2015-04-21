/**
 * Created by itayk on 2/12/15.
 */
var express = require('express');
var fs = require('fs');
var q= require('q');
var app = express();
var streamFolder = 'public';
var startTime = Date.now();
var diffTime = 20;
var windowSize = 5;
var numOfLiveSameple = 10;
var inProgress = false;
var exec = null;
var logs = '';
if ( !fs.existsSync(streamFolder)){
	console.error("Can't find public folder");
	process.exit(1);
}

function log(text){
	var now = new Date().getTime();
	console.log(now + "HLSPlay ---- " , text);
	if ( typeof text != 'string') {
		try{
			text = JSON.stringify(text);
		} catch(e){}
	}
	logs = now + "HLSPlay ---- " + text + "\\\n" + logs;
}

app.use(express.static(__dirname + '/' + streamFolder));
app.use(express.static(__dirname + '/Site' ));

function parsePlaylist(data,folder){
	var resultObject = [];
	var lines = data.split('\n');
	for (var i=0 ; i<lines.length ; i++ ) {
		var currentLine = lines[i];
		var tsLength = currentLine.match(/#EXTINF:([0-9\.]*)/);
		if (tsLength && tsLength.length>1) {
			resultObject.push(currentLine + '\n' + folder +'/' + lines[i+1]+'\n');
		}
	}
	return resultObject;
}

function scanForStreams(){
	var resultObj = {};
	var streams = fs.readdirSync(streamFolder);
	streams.forEach(function(item,index){

		if (fs.lstatSync(streamFolder +'/' + item ).isDirectory()) {
			resultObj[item] = [];
			var bitRates = fs.readdirSync( streamFolder + '/' + item );
			bitRates.forEach( function ( bitem , bindex ) {
				if (fs.lstatSync(streamFolder + '/' + item + '/' + bitem ).isDirectory()) {
					var bitrate = bitem.split( "_" );
					if ( bitrate.length > 1 ) {
						bitrate = bitrate[1];
						var tsList = {};
						tsList.bitrate =bitrate;
						tsList.count=100;
						tsList.duration = 1000;
						tsList.data = parsePlaylist(fs.readFileSync( streamFolder + '/' + item + '/' + bitem + '/playlist.m3u8' , 'utf8' ),bitem);
						resultObj[item].push(tsList);
					}
				}
			} );
		}
		log(resultObj);
	});
	return resultObj;
}
var streams = scanForStreams();

app.get('/reset',function(req, res, next){
	startTime = Date.now();
	res.send('Time reset');
});
app.get('/:stream/play.m3u8', function(req, res, next) {
	log(req.url);
	var streamName =  req.params['stream'];
	if ( !streamName && !streams[streamName] ) {
		next();
		return;
	}
	//res.send('found!');
	var response = '';
	var masterFile = fs.readFileSync(streamFolder + '/' +streamName + '/master.m3u8', 'utf8' ).split('\n');
	for (var i=0 ; i < masterFile.length; i++){
		var currentLine = masterFile[i];
		if (currentLine.indexOf('#') == 0){
			response += currentLine +'\n';
		} else {
			var preLine = masterFile[i-1];
			var bwMatch = preLine.match(/#EXT-.*BANDWIDTH=([0-9]*),/);
			if (bwMatch && bwMatch.length >1) {
				response += '/'+ streamName +'/bitRate_' + bwMatch[1] + '.m3u8\n';
			}
		}
	}
	res.contentType('application/vnd.apple.mpegurl');
	res.send(response);

});

app.get('/:stream/bitrate_:rate.m3u8',function(req, res, next){
	log(req.url);
	var response = '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-ALLOW-CACHE:NO\n#EXT-X-TARGETDURATION:13\n#EXT-X-MEDIA-SEQUENCE:0\n';
	var streamName =  req.params['stream'];
	var bitRate = req.params['rate'];
	var segmentLength = 10;
	if (!streamName && !bitRate && !streams[streamName]){
		next();
		return;
	}
	//res.send('streamName:' + streamName+ '-----' +bitRate);
	var diff = (Date.now() - startTime)/1000;
	var streamObj = streams[streamName];
	var bitRateObj = null;
	streamObj.forEach(function(item,index){
		if (item.bitrate === bitRate){
			bitRateObj = item;
		}
	});
	if (bitRateObj){
		var segmentsLength = bitRateObj.count;
		var timeTillNow = 0;
		for (var i=0 ; i < bitRateObj.data.length ; i++){
			var currentLine = bitRateObj.data[i];
			var tsLength = currentLine.match(/#EXTINF:([0-9\.]*)/);
			if (tsLength && tsLength.length>1) {
				timeTillNow += parseFloat( tsLength[1] );
				if (timeTillNow  < diff + diffTime ){
					response += currentLine;
				}
			}
		}
	}
	res.contentType('application/vnd.apple.mpegurl');

	res.send(response);

});

app.get('/list' , function(req, res, next){
	streams = scanForStreams();
	var result = [];
	for (var i in streams){
		result.push({name:i,url:"/"+i+"/play.m3u8",numOfBitrate:streams[i].length});
	}
	res.send(JSON.stringify(result));
});

app.get('/add/:name/:url/:isLive', function(req,res,next){
	log(req.url);
	if (inProgress){
		res.send("Error - Wait for the current capture to end :-)");
		return;
	}
	inProgress = true;
	var streamName = req.params["name"];
	var streamURL = decodeURIComponent(req.params["url"]);
	var live = req.params["isLive"];
	var samepleCount = req.params["SampleCount"];
	if (live === "true"){
		numOfLiveSameple = 10;
		if (samepleCount && parseInt(samepleCount)) {
			numOfLiveSameple =  parseInt(samepleCount);
		}
	}
	var executeGrep = function() {
		exec = require( 'child_process' ).exec;
		exec( 'node hlsGrep ' + streamURL + ' ' + streamName , function callback( error , stdout , stderr ) {
			if (live === "true" && numOfLiveSameple > 0){
				log("Grepping live content " + numOfLiveSameple +" to go");
				numOfLiveSameple--;
				executeGrep();
				return;
			}
			inProgress = false;
			log( stdout );
		} );
	};
	executeGrep();
});

app.get('/progress' , function(req,res,next){
	res.send(inProgress);
});

app.get('/kill' , function(req,res,next){
	if (exec) {
		exec.kill( 'kill' );
		inProgress = false;
	}
});

app.get('/logs', function(req,res,next){
	 res.send(logs);
	logs = '';
});

app.use(function(req, res, next) {
	var err = new Error('Not Found');
	err.status = 404;
	next(err);
});

app.use(function(err, req, res, next) {
	res.status(err.status);
	res.send({message: err.message});
});

app.listen(6060);

module.exports = app;