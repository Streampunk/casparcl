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

const kapp = new Koa();
kapp.use(cors());

const width = 1920;
const height = 1080;

let bgra8Loader;
let vidSwitcher;
let webSaver;
let v210Saver;
let bgSrcs = [];
let ovSrcs = [];
let rgbaBG;
let rgbaOV;
let rgbaDst;
let v210Dst = [];
let webDst = [];
let lastWeb;

async function loadFrame(context, count, bg, overlay, clQueue) {
  const start = process.hrtime();

  await Promise.all([
    yuv422p10Loader.loadFrame(bg, bgSrcs[count%2], clQueue),
    bgra8Loader.loadFrame(overlay, ovSrcs[count%2], clQueue),
  ]);

  const end = process.hrtime(start);
  // console.log(`Load-${count}: ${(end[1] / 1000000.0).toFixed(2)}`);

  await context.waitFinish(clQueue);
  return count;
}

async function processFrame(context, count, clQueue) {
  const start = process.hrtime();

  await Promise.all([
    yuv422p10Loader.processFrame(bgSrcs[count%2], rgbaBG, clQueue),
    bgra8Loader.processFrame(ovSrcs[count%2], rgbaOV, clQueue),

    vidSwitcher.processFrame(
      [{ input: rgbaBG, scale: 0.75, offsetX: 0.0, offsetY: 0.0, flipH: true, flipV: false },
        { input: rgbaBG, scale: 0.75, offsetX: 0.0, offsetY: 0.0, flipH: false, flipV: true }],
      { wipe: true, frac: 0.5 },
      rgbaOV,
      rgbaDst,
      clQueue
    ),

    v210Saver.processFrame(rgbaDst, v210Dst[count%2], clQueue),
    webSaver.processFrame(rgbaDst, webDst[count%2], clQueue)
  ])

  const end = process.hrtime(start);
  // console.log(`OpenCL-${count}: ${(end[1] / 1000000.0).toFixed(2)}`);

  await context.waitFinish(clQueue);
  return count;
}

async function saveFrame(context, count, clQueue) {
  const start = process.hrtime();

  await Promise.all([
    v210Saver.saveFrame(v210Dst[count%2], clQueue),
    webSaver.saveFrame(webDst[count%2], clQueue)
  ]);

  const end = process.hrtime(start);
  // console.log(`Save-${count}: ${(end[1] / 1000000.0).toFixed(2)}`);

  await context.waitFinish(clQueue);
  return [v210Dst[count%2], webDst[count%2]];
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

  let demuxer = await beamcoder.demuxer('../../media/dpp/AS11_DPP_HD_EXAMPLE_1.mxf');
  await demuxer.seek({ time: 40 });
  let decoder = beamcoder.decoder({ name: 'h264' });

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
  rgbaBG = await context.createBuffer(numBytesRGBA, 'readwrite', 'coarse', { width: width, height: height });
  rgbaOV = await context.createBuffer(numBytesRGBA, 'readwrite', 'coarse', { width: width, height: height });

  for (let c = 0; c < 2; ++c) {
    bgSrcs[c] = await yuv422p10Loader.createBuffers();
    ovSrcs[c] = await bgra8Loader.createBuffers();

    v210Dst[c] = await context.createBuffer(v210Saver.getNumBytes(), 'writeonly', 'coarse');
    webDst[c] = await context.createBuffer(webSaver.getNumBytes(), 'writeonly', 'coarse');
  }
  rgbaDst = await context.createBuffer(numBytesRGBA, 'readwrite', 'coarse', { width: width, height: height });

  lastWeb = Buffer.alloc(webSaver.getNumBytes());

	kapp.use(async ctx => {
		ctx.body = lastWeb;
	})

	let server = kapp.listen(3001);
	process.on('SIGHUP', server.close)

	let result = [];
	let counter = 0;

	async function read() {
		let packet
		do (packet = await demuxer.read())
		while (packet.stream_index !== 0);
		return packet
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

  let start = process.hrtime();
  while (true) {
    let work = [];
    let stamp = process.hrtime();
		if (result.length >= 5) {
      result[4][1].copy(lastWeb);
      work[5] = playback.displayFrame(result[4][0]);
    }
		if (result.length >= 4) {
      work[4] = saveFrame(context, result[3], context.queue.unload);
		}
		if (result.length >= 3) {
      work[3] = processFrame(context, result[2], context.queue.process);
		}
		if (result.length >= 2) {
      work[2] = loadFrame(context, counter-2, result[1][0].frames[0].data, result[1][1], context.queue.load);
		}
		if (result.length >= 1) {
      work[1] = Promise.all([decoder.decode(result[0]),
        request('http://localhost:3000/', { encoding: null })]);
    }
    work[0] = read()
    result = await Promise.all(work)

		let diff = process.hrtime(start);
    let wait = (counter * 40) - ((diff[0] * 1000) + (diff[1] / 1000000 | 0) );
    await waitForIt(wait);
		console.log(`Clunk ${counter++} completed in ${process.hrtime(stamp)} waiting ${wait}`);
	}
};

init();
