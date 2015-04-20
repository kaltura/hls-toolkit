/**
 * Created by itayk on 2/11/15.
 */
var fs = require('fs');
var http = require('http');
var q = require('q');
var request = require('request');
var arguments = process.argv.slice(2);
var hlsStream = arguments[0] || 'http://abclive.abcnews.com/i/abc_live4@136330/master.m3u8';
var name=arguments[1] || 'ABC';
var baseDir =  'public/' + name + 'Stream/';
if ( !fs.existsSync('public')){
	fs.mkdirSync( 'public' );
}
if ( !fs.existsSync(baseDir) ) {
	fs.mkdirSync( baseDir );
}
var masterFile = fs.createWriteStream(baseDir+ 'master.m3u8');

function readMaster(){
	var deferred = q.defer();
	var request = http.get(hlsStream, function(res) {
		res.on('data', function(data) {
			masterFile.write(data);
		}).on('end', function() {
			masterFile.end();
			deferred.resolve();

		});


	});
	return deferred.promise;
}

function parseMaster(){
	var defferred = q.defer();
	var bw = {};
	var readFile = fs.readFile(baseDir+ 'master.m3u8','utf8',function(err,data){
		console.log(data);
		var lines = data.split('\n');
		for (var i=0;i<lines.length;i++){
			var line = lines[i];
			var bwMatch = line.match(/#EXT-.*BANDWIDTH=([0-9]*),/);
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
	var q = monitorAndDownload( x.arg1, x.arg2 );
	for (var i=0;i< jobs.length ; i++){
		q = q.then(worker);
	}
}

function monitorAndDownload(url,path){
	var deferred = q.defer();
	var numOfFiles = 0;
	var timeout =  30;
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
						console.log( err )
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
							request
								.get( tsUrl )
								.on( 'error' , function ( err ) {
									console.log( err )
								} )
								.on('response' ,function (res){
									numOfFiles--;
								})
								.pipe( fs.createWriteStream( path + fileName[1] ) );
						}
					}
				}else{
					if (!fileExsit && !passheader) {
						fs.appendFileSync( path + 'playlist.m3u8' , line + "\n" );
					}
				}
			}
		}
	})
	var sleep = function(){setTimeout(function() {
		timeout --;
		console.log("num of fies:" + numOfFiles + "  " + path);
		if (numOfFiles > 0 && timeout > 0){
			console.log("Sleeping for 5 sec");
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

