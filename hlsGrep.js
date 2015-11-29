/**
 * Created by itayk on 2/11/15.
 */
var fs = require('fs');
var http = require('http');
var q = require('q');
var request = require('request');
var arguments = process.argv.slice(2);
var hlsStream = arguments[0] || 'http://abclive.abcnews.com/i/abc_live4@136330/master.m3u8';
var name= arguments[1] || 'ABC';
var baseDir =  'public/' + name + 'Stream/';
if ( !fs.existsSync('public')){
	fs.mkdirSync( 'public' );
}
if ( !fs.existsSync(baseDir) ) {
	fs.mkdirSync( baseDir );
}
var masterFile = fs.createWriteStream(baseDir+ 'master.m3u8');

function log(text){
	var now = new Date().getTime();
	console.log(now + "HLSGrep ---- " , text);
}

function readMaster(){
	var deferred = q.defer();
	request.get(hlsStream, function (error, response, body) {
				console.log("Master downloaded.");
				deferred.resolve();
			}).pipe(masterFile);

	return deferred.promise;
}

function parseMaster(){
	var defferred = q.defer();
	var bw = {};
	var readFile = fs.readFile(baseDir+ 'master.m3u8','utf8',function(err,data){
		log(data);
		var lines = data.split('\n');
		for (var i=0;i<lines.length;i++){
			var line = lines[i];
			var bwMatch = line.match(/#EXT-.*BANDWIDTH=([0-9]*)/);
			if (bwMatch && bwMatch.length > 1){
				bw[bwMatch[1]] = lines[i+1];
			}
		}
		defferred.resolve(bw);

	});
	return defferred.promise;
}

function downloadSegments(bwObj){

	if ( !fs.existsSync(name + 'Stream')) {
		fs.mkdirSync( name + 'Stream' );
	}
	var jobs = [];
    for  (var i in bwObj){
	    var path = baseDir + 'bitRate_'+i +'/';
	    if ( !fs.existsSync(path)) {
		    fs.mkdirSync( path);
	    }
	    jobs.push({arg1:bwObj[i],arg2:path});
	   // monitorAndDownload(bwObj[i],path );
	   // break;
    }
	var x = jobs.pop();
	var worker = function(){
		x = jobs.pop();
		return monitorAndDownload( x.arg1, x.arg2 );
	};
	var qq = monitorAndDownload( x.arg1, x.arg2 );
	for (var i=0;i< jobs.length ; i++){
		qq = qq.then(worker);
	}
}

function monitorAndDownload(url,path){
	q = require('q');
	var deferred = q.defer();
	var numOfFiles = 0;
	var timeout =  30;
	var queue = [];
	if (url.indexOf("http") == -1){
		url = hlsStream.replace(/([\w,\s-]+\.m3u8)/ig,url);
	}
	request(url, function (error, response, body) {
		if (!error && response.statusCode == 200) {
			var fileExsit = false;
			var passheader = false;
			if (!fs.existsSync(path +'playlist.m3u8')) {
				fs.writeFile( path + 'playlist.m3u8','' );
			}
			else{
				fileExsit = true;
			}
			var tsHash = {};
			var lines = body.split('\n');
			for (var i=0;i<lines.length;i++){

				var line= lines[i];
				var keyMatch = line.match(/#EXT-X-KEY:.*URI="(.*)"/);
				if (keyMatch && keyMatch.length > 1){

					request.get(url.replace(/([\w,\s-]+\.m3u8)/ig,keyMatch[1]) ).on( 'error' , function ( err ) {
						log( err )
					} )
						.pipe( fs.createWriteStream( path +  keyMatch[1] ) );
				}

				var tsLength = line.match(/#EXTINF:([0-9\.]*)/);
				if (tsLength && tsLength.length>1){
					passheader = true;
					var fileName = lines[i+1].match(/([\w,\s-]+\.ts)/);
					if (fileName && fileName.length>1) {
						if (!fs.existsSync(path + fileName[1])) {
							fs.appendFileSync(path +'playlist.m3u8',line + "\n");
							fs.appendFileSync(path +'playlist.m3u8',fileName[1] + "\n");
							var tsUrl = lines[i+1];
							if (tsUrl.indexOf("http") == -1){
								tsUrl = url.replace(/([\w,\s-]+\.m3u8)/ig,tsUrl);
							}
							numOfFiles++;
							queue.push({url:tsUrl,path:path+fileName[1]});
						}
					}
				}else{
					if (!fileExsit && !passheader) {
						fs.appendFileSync( path + 'playlist.m3u8' , line + "\n" );
					}
				}
			}

			var worker = function(){
				q = require('q');
				var deferred2 = q.defer();
				log("Grabbing file:" + queue.length);
				if (queue.length == 0 ){
					deferred2.resolve();

				}         else {
					var item = queue.pop();
					request.get( item.url )
						.on( 'error' , function ( err ) {
							deferred2.reject();
							log( err )
						} )
						.on( 'response' , function ( res ) {
							numOfFiles--;
							deferred2.resolve();
						} )
						.pipe( fs.createWriteStream( item.path ) );
				}
				return deferred2.promise;
			};
			var qqq = worker();
			for (var i=0;i<queue.length;i++){
				qqq = qqq.allSettled([worker(),worker(),worker(),worker(),worker()]);;
			}
		}
	});

	var sleep = function(){setTimeout(function() {
		timeout --;
		log("num of fies:" + numOfFiles + "  " + path);
		if (numOfFiles > 0 && timeout > 0){
			log("Sleeping for 5 sec");
			sleep();
		}  else {
			deferred.resolve(numOfFiles);
		}

	}, 5000);};
	sleep();
	return deferred.promise;
}

readMaster()
	.then( parseMaster)
	.then( downloadSegments);

