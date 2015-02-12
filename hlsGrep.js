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
var baseDir =  name + 'Stream/';
if ( !fs.existsSync(name + 'Stream')) {
	fs.mkdirSync( name + 'Stream' );
}
var masterFile = fs.createWriteStream(name+ 'Stream/'+ 'master.m3u8');

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
	var readFile = fs.readFile(name+ 'Stream/'+ 'master.m3u8','utf8',function(err,data){
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
	var baseDir =  name + 'Stream/';
	if ( !fs.existsSync(name + 'Stream')) {
		fs.mkdirSync( name + 'Stream' );
	}
    for  (var i in bwObj){
	    var path = baseDir + 'bitRate_'+i +'/';
	    if ( !fs.existsSync(path)) {
		    fs.mkdirSync( path);
	    }
	    monitorAndDownload(bwObj[i],path )
	   // break;
    }
}

function monitorAndDownload(url,path){

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
				var tsLength = line.match(/#EXTINF:([0-9\.]*)/);
				if (tsLength && tsLength.length>1){
					passheader = true;
					var fileName = lines[i+1].match(/([\w,\s-]+\.ts)/);
					if (fileName && fileName.length>1) {
						if (!fs.existsSync(path + fileName[1])) {
							fs.appendFileSync(path +'playlist.m3u8',line + "\n");
							fs.appendFileSync(path +'playlist.m3u8',fileName[1] + "\n");
							var url = lines[i+1];
							if (url.indexOf("http") == -1){
								 url = hlsStream.replace(/([\w,\s-]+\.m3u8)/ig,url);
							}
							request
								.get( url )
								.on( 'error' , function ( err ) {
									console.log( err )
								} )
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
}

readMaster()
	.then( parseMaster)
	.then( downloadSegments);

