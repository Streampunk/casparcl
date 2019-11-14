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
let rgbaBG;
let rgbaOV;
let rgbaDst;
let v210Dst;
let webDst;
let lastWeb;

async function processFrame(bg, overlay) {
  let start = process.hrtime();

  await yuv422p10Loader.processFrame(bg, rgbaBG);
  await bgra8Loader.processFrame(overlay, rgbaOV);

  timings = await vidSwitcher.processFrame(
    [{ input: rgbaBG, scale: 0.75, offsetX: 0.0, offsetY: 0.0, flipH: true, flipV: false },
     { input: rgbaBG, scale: 0.75, offsetX: 0.0, offsetY: 0.0, flipH: false, flipV: true }],
    { wipe: true, frac: 0.5 },
    rgbaOV,
    rgbaDst
  )

  await v210Saver.processFrame(rgbaDst, v210Dst);
  await webSaver.processFrame(rgbaDst, webDst);

  // let end = process.hrtime(start);
  // console.log('OpenCL:', end);
}

async function init () {
  const platformIndex = 0;
  const deviceIndex = 0;
  const context = new addon.clContext({
    platformIndex: platformIndex,
    deviceIndex: deviceIndex
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

  rgbaDst = await context.createBuffer(numBytesRGBA, 'readwrite', 'coarse', { width: width, height: height });

  v210Dst = await context.createBuffer(v210Saver.getNumBytes(), 'writeonly', 'coarse');
  webDst = await context.createBuffer(webSaver.getNumBytes(), 'writeonly', 'coarse');

  lastWeb = Buffer.alloc(webSaver.getNumBytes());

	kapp.use(async ctx => {
		ctx.body = lastWeb;
	})

	let server = kapp.listen(3001);
	process.on('SIGHUP', server.close)

	let result = []
	let counter = 0

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
		let work = []
    let stamp = process.hrtime();
		work[0] = read()
		if (result.length >= 1) {
     	work[1] = Promise.all([decoder.decode(result[0]),
				 request('http://localhost:3000/', { encoding: null })]);;
		}
		if (result.length >= 2) {
			// console.log(result[2])
			work[2] = processFrame(result[1][0].frames[0].data, result[1][1])
		}
		if (result.length >= 3) {
      webDst.copy(lastWeb);
			work[3] = playback.displayFrame(v210Dst)
		}
		result = await Promise.all(work)
		let diff = process.hrtime(start)
		let wait = (counter * 40) - ((diff[0] * 1000) + (diff[1] / 1000000 | 0) )
		await waitForIt(wait)
		console.log(`Clunk ${counter++} completed in ${process.hrtime(stamp)} waiting ${wait}`)
	}
};

init();
