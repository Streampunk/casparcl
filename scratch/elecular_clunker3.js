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
const addon = require('nodencl')
const request = require('request-promise-native')
const Koa = require('koa')
const cors = require('@koa/cors')
const beamcoder = require('beamcoder')

const io = require('../lib/process/io')
const v210 = require('../lib/process/v210')
const yuv422p10 = require('../lib/process/yuv422p10')
const bgra8 = require('../lib/process/bgra8')
const rgba8 = require('../lib/process/rgba8')
const vidSwitch = require('../lib/process/switch')

const macadam = require('macadam')
const oscServer = require('./oscServer.js')

const kapp = new Koa()
kapp.use(cors())

const enableMacadam = false
const enableDeinterlace = true
const width = 1920
const height = 1080

const oscPort = 9876
const oscRemoteAddr = '192.168.1.202'

const numInputs = enableMacadam ? 2 : 1

let scale0 = 0.75
let scale1 = 0.75
let offset0 = 0.0
let offset1 = 0.0
let flipV0 = false
let flipV1 = true
let rotate = 0.0
let wipeFrac = 0.5

let v210Loader
let yuv422p10Loader
let bgra8Loader
let vidSwitcher
let webSaver
let v210Saver

let lastWeb

async function loadFrame(context, srcs, overlay, clQueue) {
	// const start = process.hrtime();
	const numFields = srcs[0].source.data.length

	const bgSrcs = []
	const ovSrcs = []

	for (let field = 0; field < numFields; ++field) {
		bgSrcs.push([])
		const loadPromises = srcs.map(async (src, i) => {
			bgSrcs[field].push({ loader: src.loader, sources: await src.loader.createSources() })
			return src.loader.loadFrame(src.source.data[field].data, bgSrcs[field][i].sources, clQueue)
		})

		ovSrcs.push({ loader: overlay.loader, sources: await overlay.loader.createSources() })
		loadPromises.push(overlay.loader.loadFrame(overlay.source.data, ovSrcs[field].sources, clQueue))

		await Promise.all(loadPromises)
	}

	// const end = process.hrtime(start);
	// console.log(`Load-${srcs[0].count}: ${(end[1] / 1000000.0).toFixed(2)}`);

	await context.waitFinish(clQueue)
	// const done = process.hrtime(start);
	// console.log(`Load done-${srcs[0].count}: ${(done[0] * 1000.0 + done[1] / 1000000.0).toFixed(2)}`);
	return { count: srcs[0].source.count, numFields: numFields, bgSrcs: bgSrcs, ovSrcs: ovSrcs }
}

async function processFrame(context, params, clQueue) {
	// const start = process.hrtime();

	const rgbaBGs = []
	const rgbaOVs = []
	const rgbaDsts = []
	const v210Dsts = await v210Saver.createDests()
	const webDsts = await webSaver.createDests()

	for (let field = 0; field < params.numFields; ++field) {
		const srcs = params.bgSrcs[field]
		const ovs = params.ovSrcs[field]
		rgbaBGs.push([])
		const processPromises = srcs.map(async (src, i) => {
			rgbaBGs[field].push(await src.loader.createDest({ width: width, height: height }))
			return src.loader.processFrame(src.sources, rgbaBGs[field][i], clQueue)
		})

		rgbaOVs.push(await ovs.loader.createDest({ width: width, height: height }))
		processPromises.push(ovs.loader.processFrame(ovs.sources, rgbaOVs[field], clQueue))

		rgbaDsts.push(
			await context.createBuffer(
				v210Loader.getNumBytesRGBA(),
				'readwrite',
				'coarse',
				{ width: width, height: height },
				'processFrame'
			)
		)

		const s0 = 0
		const s1 = numInputs > 1 ? 1 : 0
		processPromises.push(
			vidSwitcher.processFrame(
				[
					{
						input: rgbaBGs[field][s0],
						scale: scale0,
						offsetX: offset0,
						offsetY: 0.0,
						flipH: false,
						flipV: flipV0,
						rotate: rotate
					},
					{
						input: rgbaBGs[field][s1],
						scale: scale1,
						offsetX: offset1,
						offsetY: 0.0,
						flipH: false,
						flipV: flipV1,
						rotate: rotate
					}
				],
				{ wipe: true, frac: wipeFrac },
				[rgbaOVs[field]],
				rgbaDsts[field],
				clQueue
			)
		)
		await Promise.all(processPromises)

		const interlace = enableDeinterlace ? 0x1 | (field << 1) : 0
		await Promise.all([
			enableMacadam
				? processPromises.push(
						v210Saver.processFrame(rgbaDsts[field], v210Dsts, clQueue, interlace)
				  )
				: Promise.resolve(),
			field === 0
				? processPromises.push(webSaver.processFrame(rgbaDsts[field], webDsts, clQueue))
				: Promise.resolve()
		])

		await Promise.all(processPromises)
		srcs.forEach((sArr) => sArr.sources.forEach((s) => s.release()))
		ovs.sources.forEach((s) => s.release())
		rgbaDsts.forEach((s) => s.release())
	}

	// const end = process.hrtime(start);
	// console.log(`OpenCL-${params.count}: ${(end[1] / 1000000.0).toFixed(2)}`);

	await context.waitFinish(clQueue)
	rgbaBGs.forEach((sArr) => sArr.forEach((s) => s.release()))
	rgbaOVs.forEach((s) => s.release())

	// const done = process.hrtime(start);
	// console.log(`OpenCL done-${params.count}: ${(done[0] * 1000.0 + done[1] / 1000000.0).toFixed(2)}`);
	return { count: params.count, v210Dsts: v210Dsts, webDsts: webDsts }
}

async function saveFrame(context, params, clQueue) {
	// const start = process.hrtime();

	await Promise.all([
		enableMacadam ? v210Saver.saveFrame(params.v210Dsts[0], clQueue) : Promise.resolve(),
		webSaver.saveFrame(params.webDsts[0], clQueue)
	])

	// const end = process.hrtime(start);
	// console.log(`Save-${params.count}: ${(end[1] / 1000000.0).toFixed(2)}`);

	await context.waitFinish(clQueue)

	// const done = process.hrtime(start);
	// console.log(`Save done-${params.count}: ${(done[0] * 1000.0 + done[1] / 1000000.0).toFixed(2)}`);
	return [params.v210Dsts[0], params.webDsts[0]]
}

async function init() {
	const platformIndex = 0
	const deviceIndex = 0
	const context = new addon.clContext({
		platformIndex: platformIndex,
		deviceIndex: deviceIndex,
		overlapping: true
	})
	await context.initialise()
	const platformInfo = context.getPlatformInfo()
	console.log(platformInfo.vendor, platformInfo.devices[deviceIndex].type)

	let demuxer = await beamcoder.demuxer('M:/dpp/AS11_DPP_HD_EXAMPLE_1.mxf')
	await demuxer.seek({ time: 40 })
	const stream = demuxer.streams[0]
	let decoder = beamcoder.decoder({ name: stream.codecpar.name })
	let filterer = await beamcoder.filterer({
		filterType: 'video',
		inputParams: [
			{
				width: stream.codecpar.width,
				height: stream.codecpar.height,
				pixelFormat: stream.codecpar.format,
				timeBase: stream.time_base,
				pixelAspect: stream.codecpar.sample_aspect_ratio
			}
		],
		outputParams: [
			{
				pixelFormat: stream.codecpar.format
			}
		],
		// filterSpec: 'yadif=mode=1:parity=-1:deint=0'
		filterSpec: 'yadif=mode=0:parity=-1:deint=0'
	})

	const bgColSpecRead = '709'
	const ovColSpecRead = 'sRGB'
	const colSpecWrite = '709'
	const webColSpecWrite = 'sRGB'

	v210Loader = new io.ToRGBA(context, bgColSpecRead, colSpecWrite, new v210.Reader(width, height))
	await v210Loader.init()

	yuv422p10Loader = new io.ToRGBA(
		context,
		bgColSpecRead,
		colSpecWrite,
		new yuv422p10.Reader(width, height)
	)
	await yuv422p10Loader.init()

	bgra8Loader = new io.ToRGBA(context, ovColSpecRead, colSpecWrite, new bgra8.Reader(width, height))
	await bgra8Loader.init()

	vidSwitcher = new vidSwitch.default(context, width, height, 2, 1)
	await vidSwitcher.init()

	v210Saver = new io.FromRGBA(
		context,
		colSpecWrite,
		new v210.Writer(width, height, enableDeinterlace)
	)
	await v210Saver.init()

	webSaver = new io.FromRGBA(
		context,
		webColSpecWrite,
		new rgba8.Writer(width / 2, height / 2, false),
		width,
		height
	)
	await webSaver.init()

	lastWeb = Buffer.alloc(webSaver.getTotalBytes())

	kapp.use(async (ctx) => {
		ctx.body = lastWeb
	})

	let server = kapp.listen(3001)
	process.on('SIGHUP', server.close)

	const oscServ = new oscServer({ port: oscPort, remoteAddr: oscRemoteAddr })
	oscServ.addControl(
		'/1/fader1',
		(v) => (scale0 = v[0]),
		() => [{ type: 'f', value: scale0 }]
	)
	oscServ.addControl(
		'/1/fader2',
		(v) => (scale1 = v[0]),
		() => [{ type: 'f', value: scale1 }]
	)
	oscServ.addControl(
		'/1/fader3',
		(v) => (offset0 = (v[0] - 0.5) * 2.0),
		() => [{ type: 'f', value: offset0 / 2.0 + 0.5 }]
	)
	oscServ.addControl(
		'/1/fader4',
		(v) => (rotate = (v[0] - 0.5) * 2 * Math.PI),
		() => [{ type: 'f', value: rotate / 2.0 / Math.PI + 0.5 }]
	)
	oscServ.addControl(
		'/1/toggle1',
		(v) => (flipV0 = v[0] !== 0),
		() => [{ type: 'i', value: flipV0 ? 1 : 0 }]
	)
	oscServ.addControl(
		'/1/toggle2',
		(v) => (flipV1 = v[0] !== 0),
		() => [{ type: 'i', value: flipV1 ? 1 : 0 }]
	)
	oscServ.addControl(
		'/1/fader5',
		(v) => (wipeFrac = v[0]),
		() => [{ type: 'f', value: wipeFrac }]
	)

	let result = []
	let counter = 0

	async function read(params) {
		// const start = process.hrtime();
		let packet
		do packet = await demuxer.read()
		while (packet.stream_index !== 0)
		// const done = process.hrtime(start);
		// console.log(`read-${params.count}: ${(done[0] * 1000.0 + done[1] / 1000000.0).toFixed(2)}`);
		return { count: params.count, data: packet }
	}

	async function decode(params) {
		// const start = process.hrtime();
		let frame = await decoder.decode(params.data)
		// const done = process.hrtime(start);
		// console.log(`decode-${params.count}: ${(done[0] * 1000.0 + done[1] / 1000000.0).toFixed(2)}`);
		return { count: params.count, data: frame.frames }
	}

	async function readCapture(params) {
		// const start = process.hrtime();
		let data
		if (enableMacadam) {
			let frame = await capture.frame()
			data = [frame.video]
		}
		// const done = process.hrtime(start);
		// console.log(`readCapture-${params.count}: ${(done[0] * 1000.0 + done[1] / 1000000.0).toFixed(2)}`);
		return { count: params.count, data: data }
	}

	async function deinterlace(params) {
		// const start = process.hrtime();
		const doDeinterlace = enableDeinterlace // && params.data[0].interlaced_frame;
		let filtFrames = params.data
		if (doDeinterlace) filtFrames = await filterer.filter(params.data)
		const result = doDeinterlace ? filtFrames[0].frames : params.data
		// const done = process.hrtime(start);
		// console.log(`deinterlace-${params.count}: ${(done[0] * 1000.0 + done[1] / 1000000.0).toFixed(2)}`);
		return { count: params.count, data: result }
	}

	async function reqOverlay(params) {
		// const start = process.hrtime();
		let ov = await request('http://localhost:3000/', { encoding: null })
		// const done = process.hrtime(start);
		// console.log(`reqOverlay-${params.count}: ${(done[0] * 1000.0 + done[1] / 1000000.0).toFixed(2)}`);
		return { count: params.count, data: ov }
	}

	async function waitForIt(t) {
		return new Promise((resolve) => {
			setTimeout(resolve, t > 0 ? t : 0)
		})
	}

	let capture, playback
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

	let start = process.hrtime()
	// eslint-disable-next-line no-constant-condition
	while (true) {
		let work = []
		let stamp = process.hrtime()
		// if (result.length >= 7) {
		// 	result[6].buf.release()
		// }
		if (result.length >= 6) {
			result[5][1].copy(lastWeb)
			if (enableMacadam) {
				work[6] = playback.displayFrame(result[5][0])
			}
			result[5][0].release()
			result[5][1].release()
		}
		if (result.length >= 5) {
			work[5] = saveFrame(context, result[4], context.queue.unload)
		}
		if (result.length >= 4) {
			work[4] = processFrame(context, result[3], context.queue.process)
		}
		if (result.length >= 3) {
			if (result[2][0].data.length) {
				let srcs = []
				if (enableMacadam) srcs.push({ loader: v210Loader, source: result[2][1] })
				srcs.push({ loader: yuv422p10Loader, source: result[2][0] })
				const ovs = { loader: bgra8Loader, source: result[2][enableMacadam ? 2 : 1] }
				work[3] = loadFrame(context, srcs, ovs, context.queue.load)
			}
		}
		if (result.length >= 2) {
			let promises = []
			promises.push(deinterlace(result[1]))
			if (enableMacadam) promises.push(readCapture(result[1]))
			promises.push(reqOverlay(result[1]))
			work[2] = Promise.all(promises)
		}
		if (result.length >= 1) {
			work[1] = decode(result[0])
		}
		work[0] = read({ count: counter })
		result = await Promise.all(work)

		let diff = process.hrtime(start)
		let wait = counter * 40 - (diff[0] * 1000 + ((diff[1] / 1000000) | 0))
		await waitForIt(wait)
		diff = process.hrtime(stamp)
		console.log(
			`Clunk ${counter++} completed in ${
				diff[0] * 1000 + ((diff[1] / 1000000) | 0)
			} waiting ${wait}`
		)
	}
}

init()
