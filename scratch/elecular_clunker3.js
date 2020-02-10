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
const oscServer = require('./oscServer.js');

const kapp = new Koa();
kapp.use(cors());

const enableMacadam = true;
const enableDeinterlace = true;
const width = 1920;
const height = 1080;

const oscPort = 9876;
const oscRemoteAddr = '192.168.1.202';

const numInputs = enableMacadam ? 2 : 1;

let scale0 = 0.75;
let scale1 = 0.75;
let offset0 = 0.0;
let offset1 = 0.0;
let flipV0 = false;
let flipV1 = true;
let wipeFrac = 0.5;

let v210Loader;
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

async function loadFrame(context, srcs, overlay, clQueue) {
  // const start = process.hrtime();
  const c = srcs[0].count%2;
  const numFields = srcs[0].data.length;

  for (let field=0; field<numFields; ++field) {
    let loadPromises = srcs.map((src, i) => bgSrcs[field][c][i].loader.loadFrame(src.data[field].data, bgSrcs[field][c][i].bufs, clQueue));
    loadPromises.push(ovSrcs[field][c].loader.loadFrame(overlay.data, ovSrcs[field][c].bufs, clQueue));
    await Promise.all(loadPromises);
  }

  // const end = process.hrtime(start);
  // console.log(`Load-${srcs[0].count}: ${(end[1] / 1000000.0).toFixed(2)}`);

  await context.waitFinish(clQueue);
  // const done = process.hrtime(start);
  // console.log(`Load done-${srcs[0].count}: ${(done[0] * 1000.0 + done[1] / 1000000.0).toFixed(2)}`);
  return { count: srcs[0].count, numFields: numFields };
}

async function processFrame(context, params, clQueue) {
  // const start = process.hrtime();
  const c = params.count%2;

  for (let field=0; field<params.numFields; ++field) {
    const srcs = bgSrcs[field][c];
    const ovs = ovSrcs[field][c];
    let processPromises = srcs.map((src, i) =>
      bgSrcs[field][c][i].loader.processFrame(src.bufs, rgbaBG[field][i], clQueue));
    processPromises.push(ovs.loader.processFrame(ovs.bufs, rgbaOV[field], clQueue));

    let s0 = 0;
    let s1 = numInputs > 1 ? 1 : 0;
    processPromises.push(vidSwitcher.processFrame(
      [{ input: rgbaBG[field][s0], scale: scale0, offsetX: offset0, offsetY: 0.0, flipH: false, flipV: flipV0 },
       { input: rgbaBG[field][s1], scale: scale1, offsetX: offset1, offsetY: 0.0, flipH: false, flipV: flipV1 }],
      { wipe: true, frac: wipeFrac },
      rgbaOV[field],
      rgbaDst[field],
      clQueue
    ));
    await Promise.all(processPromises);
  }

  await Promise.all([
    v210Saver.processFrame(rgbaDst, params.numFields, v210Dst[c], clQueue),
    webSaver.processFrame(rgbaDst, params.numFields, webDst[c], clQueue)
  ])

  // const end = process.hrtime(start);
  // console.log(`OpenCL-${params.count}: ${(end[1] / 1000000.0).toFixed(2)}`);

  await context.waitFinish(clQueue);
  // const done = process.hrtime(start);
  // console.log(`OpenCL done-${params.count}: ${(done[0] * 1000.0 + done[1] / 1000000.0).toFixed(2)}`);
  return { count: params.count };
}

async function saveFrame(context, params, clQueue) {
  // const start = process.hrtime();
  const c = params.count%2;

  await Promise.all([
    v210Saver.saveFrame(v210Dst[c], clQueue),
    webSaver.saveFrame(webDst[c], clQueue)
  ]);

  // const end = process.hrtime(start);
  // console.log(`Save-${params.count}: ${(end[1] / 1000000.0).toFixed(2)}`);

  await context.waitFinish(clQueue);
  // const done = process.hrtime(start);
  // console.log(`Save done-${params.count}: ${(done[0] * 1000.0 + done[1] / 1000000.0).toFixed(2)}`);
  return [v210Dst[c], webDst[c]];
}

async function init () {
  const platformIndex = 0;
  const deviceIndex = 0;
  const context = new addon.clContext({
    platformIndex: platformIndex,
    deviceIndex: deviceIndex,
    overlapping: true
  });
  const platformInfo = await context.getPlatformInfo();
  console.log(platformInfo.vendor, platformInfo.devices[deviceIndex].type);

  let demuxer = await beamcoder.demuxer('M:/dpp/AS11_DPP_HD_EXAMPLE_1.mxf');
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
    // filterSpec: 'yadif=mode=1:parity=-1:deint=0'
    filterSpec: 'yadif=mode=0:parity=-1:deint=0'
  })

	const bgColSpecRead = '709';
  const ovColSpecRead = 'sRGB';
  const colSpecWrite = '709';
  const webColSpecWrite = 'sRGB';

  v210Loader = new io.toRGBA(context, width, height, 'v210');
  await v210Loader.init({colSpecRead: bgColSpecRead, colSpecWrite: colSpecWrite});

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
      bgSrcs[f][c] = [];
      for (let i = 0; i < numInputs; ++i) {
        const loader = (enableMacadam && (0 == i)) ? v210Loader : yuv422p10Loader;
        bgSrcs[f][c][i] = { loader: loader, bufs: await loader.createBuffers() };
      }
      ovSrcs[f][c] = { loader: bgra8Loader, bufs: await bgra8Loader.createBuffers() };
    }

    rgbaBG[f] = [];
    for (let i = 0; i < numInputs; ++i)
      rgbaBG[f][i] = await context.createBuffer(numBytesRGBA, 'readwrite', 'coarse', { width: width, height: height });
    rgbaOV[f] = await context.createBuffer(numBytesRGBA, 'readwrite', 'coarse', { width: width, height: height });
    rgbaDst[f] = await context.createBuffer(numBytesRGBA, 'readwrite', 'coarse', { width: width, height: height });
  }

  for (let c = 0; c < 2; ++c) {
    v210Dst[c] = await context.createBuffer(v210Saver.getNumBytes(), 'writeonly', 'coarse');
    v210Dst[c].interlaced = false;
    // v210Dst[c].tff = true;

    webDst[c] = await context.createBuffer(webSaver.getNumBytes(), 'writeonly', 'coarse');
    webDst[c].interlaced = false;
  }

  lastWeb = Buffer.alloc(webSaver.getNumBytes());

	kapp.use(async ctx => {
		ctx.body = lastWeb;
	})

	let server = kapp.listen(3001);
	process.on('SIGHUP', server.close)

  const oscServ = new oscServer({ port: oscPort, remoteAddr: oscRemoteAddr });
  oscServ.addControl('/1/fader1', v => scale0 = v[0], () => [{ type: 'f', value: scale0 }]);
  oscServ.addControl('/1/fader2', v => scale1 = v[0], () => [{ type: 'f', value: scale1 }]);
  oscServ.addControl('/1/fader3', v => offset0 = (v[0] - 0.5) * 2.0, () => [{ type: 'f', value: offset0 / 2.0 + 0.5 }]);
  oscServ.addControl('/1/fader4', v => offset1 = (v[0] - 0.5) * 2.0, () => [{ type: 'f', value: offset1 / 2.0 + 0.5 }]);
	oscServ.addControl('/1/toggle1', v => flipV0 = v[0] !== 0, () => [{ type: 'i', value: flipV0 ? 1 : 0 }]);
	oscServ.addControl('/1/toggle2', v => flipV1 = v[0] !== 0, () => [{ type: 'i', value: flipV1 ? 1 : 0 }]);
	oscServ.addControl('/1/fader5', v => wipeFrac = v[0], () => [{ type: 'f', value: wipeFrac }]);

	let result = [];
	let counter = 0;

	async function read(params) {
    // const start = process.hrtime();
		let packet
		do (packet = await demuxer.read())
    while (packet.stream_index !== 0);
    // const done = process.hrtime(start);
    // console.log(`read-${params.count}: ${(done[0] * 1000.0 + done[1] / 1000000.0).toFixed(2)}`);
		return { count: params.count, data: packet };
	}

	async function decode(params) {
    // const start = process.hrtime();
    let frame = await decoder.decode(params.data);
    // const done = process.hrtime(start);
    // console.log(`decode-${params.count}: ${(done[0] * 1000.0 + done[1] / 1000000.0).toFixed(2)}`);
		return { count: params.count, data: frame.frames };
	}

  async function readCapture(params) {
    // const start = process.hrtime();
    let data;
    if (enableMacadam) {
      let frame = await capture.frame();
      data = [ frame.video ];
    }
    // const done = process.hrtime(start);
    // console.log(`readCapture-${params.count}: ${(done[0] * 1000.0 + done[1] / 1000000.0).toFixed(2)}`);
		return { count: params.count, data: data };
  }

  async function deinterlace(params) {
    // const start = process.hrtime();
    const doDeinterlace = enableDeinterlace; // && params.data[0].interlaced_frame;
    let filtFrames = params.data;
    if (doDeinterlace)
      filtFrames = await filterer.filter(params.data);
    const result = doDeinterlace ? filtFrames[0].frames : params.data;
    // const done = process.hrtime(start);
    // console.log(`deinterlace-${params.count}: ${(done[0] * 1000.0 + done[1] / 1000000.0).toFixed(2)}`);
    return { count: params.count, data: result };
	}

	async function reqOverlay(params) {
    // const start = process.hrtime();
		let ov = await request('http://localhost:3000/', { encoding: null });
    // const done = process.hrtime(start);
    // console.log(`reqOverlay-${params.count}: ${(done[0] * 1000.0 + done[1] / 1000000.0).toFixed(2)}`);
		return { count: params.count, data: ov };
	}

	async function waitForIt (t) {
		return new Promise((resolve, reject) => {
			setTimeout(resolve, t > 0 ? t : 0)
		})
	}

  let capture, playback;
  if (enableMacadam) {
    capture = await macadam.capture({
      deviceIndex: 0, // Index relative to the 'macadam.getDeviceInfo()' array
      displayMode: macadam.bmdModeHD1080p25,
      pixelFormat: macadam.bmdFormat10BitYUV
    })

    playback = await macadam.playback({
    	deviceIndex: 0, // Index relative to the 'macadam.getDeviceInfo()' array
    	displayMode: macadam.bmdModeHD1080p25,
    	pixelFormat: macadam.bmdFormat10BitYUV
    })
  }

  let start = process.hrtime();
  while (true) {
    let work = [];
    let stamp = process.hrtime();
    if (result.length >= 6) {
      result[5][1].copy(lastWeb);
      if (enableMacadam)
        work[6] = playback.displayFrame(result[5][0]);
    }
		if (result.length >= 5) {
      work[5] = saveFrame(context, result[4], context.queue.unload);
		}
		if (result.length >= 4) {
      work[4] = processFrame(context, result[3], context.queue.process);
		}
		if (result.length >= 3) {
      if (result[2][0].data.length) {
        let srcs = [];
        if (enableMacadam)
          srcs.push(result[2][1]);
        srcs.push(result[2][0]);
        const ovs = enableMacadam ? result[2][2] : result[2][1];
        work[3] = loadFrame(context, srcs, ovs, context.queue.load);
      }
		}
		if (result.length >= 2) {
      let promises = [];
      promises.push(deinterlace(result[1]));
      if (enableMacadam)
        promises.push(readCapture(result[1]));
      promises.push(reqOverlay(result[1]));
      work[2] = Promise.all(promises);
    }
		if (result.length >= 1) {
      work[1] = decode(result[0]);
    }
    work[0] = read({ count: counter })
    result = await Promise.all(work)

		let diff = process.hrtime(start);
    let wait = (counter * 40) - ((diff[0] * 1000) + (diff[1] / 1000000 | 0) );
    await waitForIt(wait);
		console.log(`Clunk ${counter++} completed in ${process.hrtime(stamp)} waiting ${wait}`);
	}
};

init();
