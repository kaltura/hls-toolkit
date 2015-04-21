/**
 * node hlsGrep.js streamUrl streamName
 * 
 * Capture an HLS stream for later playback.
 *
 * (c) Kaltura 2015
 */

// Imports
var fs      = require('fs');
var q       = require('q');
var request = require('request');

// Start up.
var arguments = process.argv.slice(2);
var hlsStream = arguments[0] || 'http://abclive.abcnews.com/i/abc_live4@136330/master.m3u8';
var name      = arguments[1] || 'ABC';

console.log("Capturing stream " + hlsStream + " to " + name);

var enableDebugLog = false;
function debugLog(msg)
{
	if(!enableDebugLog)
		return;

	console.log(msg);
}

// Set up output folder.
var baseDir =  'public/' + name + 'Stream/';
if ( !fs.existsSync('public')){
	console.log("   Creating folder public");
	fs.mkdirSync( 'public' );
}
if ( !fs.existsSync(baseDir) ) {
	console.log("   Creating folder " + baseDir);
	fs.mkdirSync( baseDir );
}

// Open manifest for output.
var masterFile = fs.createWriteStream(baseDir + 'master.m3u8');

/**
 * Download the master manifest.
 */
function readMaster()
{
	console.log("Getting master " + hlsStream);
	var deferred = q.defer();

	request.get(hlsStream, function (error, response, body) {
		console.log("Master downloaded.");
		deferred.resolve();
	}).pipe(masterFile);

	return deferred.promise;
}

/**
 * Parse downloaded master manifest.
 *
 * This is a minimal regex based parser designed to extract submanifests by looking for
 * bandwidth markers.
 */
function parseMaster(){
	var deferred = q.defer();
	var bw = {};
	var readFile = fs.readFile(baseDir+ 'master.m3u8','utf8',function(err,data){
		debugLog(data);
		var lines = data.split('\n');
		for (var i=0;i<lines.length;i++){
			var line = lines[i];
			var bwMatch = line.match(/#EXT-.*BANDWIDTH=([0-9]*),/);
			if (bwMatch && bwMatch.length > 1){
				bw[bwMatch[1]] = lines[i+1];
			}
		}
		deferred.resolve(bw);

	});
	return deferred.promise;
}

/**
 * Grab segments for a given bitrate.
 */
function downloadSegments(bwObj){

	if ( !fs.existsSync(name + 'Stream')) {
		console.log("Creating folder " + (name + 'Stream'));
		fs.mkdirSync( name + 'Stream' );
	}
    for  (var i in bwObj){
	    var path = baseDir + 'bitRate_'+i +'/';
	    if ( !fs.existsSync(path)) {
		    fs.mkdirSync( path);
			console.log("Creating folder " + path);
	    }
	    monitorAndDownload(bwObj[i], path);
	   // break;
    }
}

/**
 * Watch a submanifest and grab segments.
 */
function monitorAndDownload(url,path){

	if (url.indexOf("http") == -1){
		url = hlsStream.replace(/([\w,\s-]+\.m3u8)/ig,url);
	}

	request(url, function (error, response, body) {
		if( error || response.statusCode != 200)
		{
			console.log("Error getting " + path);
			return;
		}

		// Create local playlist.
		var fileExist = false;
		if (!fs.existsSync(path +'playlist.m3u8')) {
			fs.writeFile( path + 'playlist.m3u8','' );
		}
		else
		{
			fileExist = true;
		}

		// Parse the manifest.
		var passheader = false;
		var tsHash = {};
		var lines = body.split('\n');
		debugLog(body);
		for (var i=0;i<lines.length;i++)
		{
			var line= lines[i];
			var tsLength = line.match(/#EXTINF:([0-9\.]*)/);
			debugLog("Saw length " + tsLength);

			// Skip too-short lines.
			if(!tsLength || tsLength.length<=1)
			{
				if (!fileExist && !passheader) {
					fs.appendFileSync( path + 'playlist.m3u8' , line + "\n" );
				}
				continue;					
			}

			passheader = true;
			var fileName = lines[i+1].match(/([\w,\s-\=]+\.ts)/);
			debugLog("Saw filename " + fileName);

			// Skip too-short files.
			if (!fileName || fileName.length <= 1)
				continue;

			// If we already have it, skip it.
			if(fs.existsSync(path + fileName[1]))
				continue;

			// Update the playlist.
			fs.appendFileSync(path +'playlist.m3u8',line + "\n");
			fs.appendFileSync(path +'playlist.m3u8',fileName[1] + "\n");
			var tsUrl = lines[i+1];
			if (tsUrl.indexOf("http") == -1){
				tsUrl = url.replace(/([\w,\s-\=]+\.m3u8)/ig,tsUrl);
			}

			// Get the segment and pipe to disk.
			console.log("GET " + tsUrl);
			request
				.get( tsUrl )
				.on( 'error' , function ( err ) {
					console.log( "Error getting segment '" + path + "' " + err );
				} )
				.pipe( fs.createWriteStream( path + fileName[1] ) );
		}
	});
}

// Kick off the download process.
readMaster()
	.then( parseMaster)
	.then( downloadSegments);

