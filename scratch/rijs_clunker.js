/* Copyright 2019 Streampunk Media Ltd.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/
const addon = require('nodencl');
const request = require('request-promise-native')
const Koa = require('koa');
const cors = require('@koa/cors');
const beamcoder = require('beamcoder');
const io = require('../process/io.js');
const vidSwitch = require('../process/switcher.js');
const macadam = require('macadam')
const osc = require('osc')

const kapp = new Koa();
kapp.use(cors());

const width = 1920;
const height = 1080;

let yuv422p10Loader;
let bgra8Loader;
let vidSwitcher;
let webSaver;
let v210Saver;
let bgSrcs = [];
let ovSrcs = [];
let rgbaBG = [];
let rgbaOV = [];
let rgbaDst = [];
let v210Dst = [];
let webDst = [];
let lastWeb;

async function loadFrame(context, bg, overlay, clQueue) {
  const start = process.hrtime();
  for (let field=0; field<bg.data.length; ++field) {
    await Promise.all([
      yuv422p10Loader.loadFrame(bg.data[field].data, bgSrcs[field][bg.count%2], clQueue),
      bgra8Loader.loadFrame(overlay.data, ovSrcs[field][bg.count%2], clQueue)
    ]);
  }

  const end = process.hrtime(start);
  // console.log(`Load-${bg.count}: ${(end[1] / 1000000.0).toFixed(2)}`);

  await context.waitFinish(clQueue);
  return { count: bg.count, numFields: bg.data.length };
}

let wipeParam = { wipe: true, frac: 0.5 }
let scaleFactor = 0.75
let [ flipH1, flipV1, flipH2, flipV2 ] = [ true, false, false, true ]
let xOffset = 0.0
let yOffset = 0.0

async function processFrame(context, params, clQueue) {
  const start = process.hrtime();

  for (let field=0; field<params.numFields; ++field) {
    await Promise.all([
      yuv422p10Loader.processFrame(bgSrcs[field][params.count%2], rgbaBG[field], clQueue),
      bgra8Loader.processFrame(ovSrcs[field][params.count%2], rgbaOV[field], clQueue),

      vidSwitcher.processFrame(
        [{ input: rgbaBG[field], scale: scaleFactor, offsetX: xOffset, offsetY: 0.0, flipH: flipH1, flipV: flipV1 },
         { input: rgbaBG[field], scale: scaleFactor, offsetX: xOffset, offsetY: yOffset, flipH: flipH2, flipV: flipV2 }],
        wipeParam,
        rgbaOV[field],
        rgbaDst[field],
        clQueue
      ),
    ]);
  }

  await Promise.all([
    v210Saver.processFrame(rgbaDst, params.numFields, v210Dst[params.count%2], clQueue),
    webSaver.processFrame(rgbaDst, params.numFields, webDst[params.count%2], clQueue)
  ])

  const end = process.hrtime(start);
  // console.log(`OpenCL-${count}: ${(end[1] / 1000000.0).toFixed(2)}`);

  await context.waitFinish(clQueue);
  return { count: params.count };
}

async function saveFrame(context, params, clQueue) {
  const start = process.hrtime();

  await Promise.all([
    v210Saver.saveFrame(v210Dst[params.count%2], clQueue),
    webSaver.saveFrame(webDst[params.count%2], clQueue)
  ]);

  const end = process.hrtime(start);
  // console.log(`Save-${count}: ${(end[1] / 1000000.0).toFixed(2)}`);

  await context.waitFinish(clQueue);
  return [v210Dst[params.count%2], webDst[params.count%2]];
}

async function init () {
  const enableDeinterlace = false;
  const platformIndex = 1;
  const deviceIndex = 0;
  const context = new addon.clContext({
    platformIndex: platformIndex,
    deviceIndex: deviceIndex,
    overlapping: true
  });
  const platformInfo = await context.getPlatformInfo();
  console.log(platformInfo.vendor, platformInfo.devices[deviceIndex].type);

  let demuxer = await beamcoder.demuxer('../../media/dpp/AS11_DPP_HD_EXAMPLE_1.mxf');
  await demuxer.seek({ time: 40 });
  const stream = demuxer.streams[0];
  let decoder = beamcoder.decoder({ name: stream.codecpar.name });
  let filterer = await beamcoder.filterer({
    filterType: 'video',
    inputParams: [{
      width: stream.codecpar.width,
      height: stream.codecpar.height,
      pixelFormat: stream.codecpar.format,
      timeBase: stream.time_base,
      pixelAspect: stream.codecpar.sample_aspect_ratio
    }],
    outputParams: [{
      pixelFormat: stream.codecpar.format
    }],
    filterSpec: 'yadif=mode=1:parity=-1:deint=0'
  })

	const bgColSpecRead = '709';
  const ovColSpecRead = 'sRGB';
  const colSpecWrite = '709';
  const webColSpecWrite = 'sRGB';

  yuv422p10Loader = new io.toRGBA(context, width, height, 'yuv422p10');
  await yuv422p10Loader.init({colSpecRead: bgColSpecRead, colSpecWrite: colSpecWrite});

  bgra8Loader = new io.toRGBA(context, width, height, 'bgra8');
  await bgra8Loader.init({colSpecRead: ovColSpecRead, colSpecWrite: colSpecWrite});

  vidSwitcher = new vidSwitch(context, width, height, 2, 1);
  await vidSwitcher.init();

  v210Saver = new io.fromRGBA(context, width, height, 'v210');
  await v210Saver.init({ colSpec: colSpecWrite });

  webSaver = new io.fromRGBA(context, width / 2, height / 2, 'rgba8');
  await webSaver.init({ colSpec: webColSpecWrite, srcWidth: width, srcHeight: height });

  const numBytesRGBA = width * height * 4 * 4;
  for (let f = 0; f < 2; ++f) {
    bgSrcs[f] = [];
    ovSrcs[f] = [];
    for (let c = 0; c < 2; ++c) {
      bgSrcs[f][c] = await yuv422p10Loader.createBuffers();
      ovSrcs[f][c] = await bgra8Loader.createBuffers();
    }

    rgbaBG[f] = await context.createBuffer(numBytesRGBA, 'readwrite', 'coarse', { width: width, height: height });
    rgbaOV[f] = await context.createBuffer(numBytesRGBA, 'readwrite', 'coarse', { width: width, height: height });
    rgbaDst[f] = await context.createBuffer(numBytesRGBA, 'readwrite', 'coarse', { width: width, height: height });
  }

  for (let c = 0; c < 2; ++c) {
    v210Dst[c] = await context.createBuffer(v210Saver.getNumBytes(), 'writeonly', 'coarse');
    v210Dst[c].interlaced = true;
    v210Dst[c].tff = true;

    webDst[c] = await context.createBuffer(webSaver.getNumBytes(), 'writeonly', 'coarse');
    webDst[c].interlaced = false;
  }

  lastWeb = Buffer.alloc(webSaver.getNumBytes());

	kapp.use(async ctx => {
		ctx.body = lastWeb;
	})

	let server = kapp.listen(3001);
	process.on('SIGHUP', server.close)

	let result = [];
	let counter = 0;

	async function read(params) {
		let packet
		do (packet = await demuxer.read())
		while (packet.stream_index !== 0);
		return { count: params.count, data: packet };
	}

	async function decode(params) {
    let frame = await decoder.decode(params.data);
		return { count: params.count, data: frame.frames };
	}

	async function deinterlace(params) {
    const doDeinterlace = enableDeinterlace && params.data[0].interlaced_frame;
    let filtFrames = params.data;
    if (doDeinterlace)
      filtFrames = await filterer.filter(params.data);
    const result = doDeinterlace ? filtFrames[0].frames : params.data;
    return { count: params.count, data: result };
	}

	async function reqOverlay(params) {
		let ov = await request('http://localhost:3000/', { encoding: null });
		return { count: params.count, data: ov };
	}

	async function waitForIt (t) {
		return new Promise((resolve, reject) => {
			setTimeout(resolve, t > 0 ? t : 0)
		})
	}

	let playback = await macadam.playback({
  	deviceIndex: 0, // Index relative to the 'macadam.getDeviceInfo()' array
  	displayMode: macadam.bmdModeHD1080i50,
  	pixelFormat: macadam.bmdFormat10BitYUV
	})

	const oscUdp = new osc.UDPPort({
    localAddress: "0.0.0.0",
    localPort: 9876
	});
	oscUdp.on("message", function (oscMessage) {
		console.log(oscMessage.address, oscMessage.args)
    if (oscMessage.address === '/1/fader1') {
			console.log('Setting parameter')
			wipeParam.frac = oscMessage.args[0]
			return;
		}
		if (oscMessage.address == '/1/toggle2') {
		  flipH1 = (oscMessage.args[0] === 0)
		  return;
		}
		if (oscMessage.address == '/1/toggle1') {
			flipV1 = (oscMessage.args[0] === 0)
			return;
		}
		if (oscMessage.address == '/1/fader5') {
			xOffset = oscMessage.args[0] - 0.5
			return;
		}
		if (oscMessage.address == '/1/fader2') {
			scaleFactor = oscMessage.args[0]
			return;
		}
		if (oscMessage.address == '/1/fader3') {
			yOffset = oscMessage.args[0] - 0.5
			return;
		}
		// if (oscMessage.address == '/1/fader4') {
		// 	nextRate2 = oscMessage.args[0] * oscMessage.args[0] * 4.0
		// 	return;
		// }
		if (oscMessage.address == '/1/toggle3') {
			flipH2 = (oscMessage.args[0] === 0)
			return;
		}
		if (oscMessage.address == '/1/toggle4') {
			flipV2 = (oscMessage.args[0] === 0)
			// previous2 = undefined
			return;
		}
	});
	oscUdp.open();
	oscUdp.on('ready', () => { console.log('OSC IS READY ... YYYYYEEEEEEEEEEEEEEEEEAAAAAAAAAAAAAAAAAAAAAHHHHHHHHHHHHHHHHHHHHHHH')})

  let start = process.hrtime();
  while (true) {
    let work = [];
    let stamp = process.hrtime();
    if (result.length >= 6) {
      result[5][1].copy(lastWeb);
      work[6] = playback.displayFrame(result[5][0]);
    }
		if (result.length >= 5) {
      work[5] = saveFrame(context, result[4], context.queue.unload);
		}
		if (result.length >= 4) {
      work[4] = processFrame(context, result[3], context.queue.process);
		}
		if (result.length >= 3) {
      if (result[2][0].data.length)
        work[3] = loadFrame(context, result[2][0], result[2][1], context.queue.load);
		}
		if (result.length >= 2) {
      work[2] = Promise.all([deinterlace(result[1]), reqOverlay(result[1])]);
    }
		if (result.length >= 1) {
      work[1] = decode(result[0])
    }
    work[0] = read({ count: counter })
    result = await Promise.all(work)

		let diff = process.hrtime(start);
    let wait = (counter * 40) - ((diff[0] * 1000) + (diff[1] / 1000000 | 0) );
    await waitForIt(wait);
		console.log(`Clunk ${counter++} completed in ${process.hrtime(stamp)} waiting ${wait}`);
		// wipeParam.frac = (counter % 20) > 10 ?  (20 - (counter % 20)) / 10 : (counter % 20) / 10
	}
};

init();
