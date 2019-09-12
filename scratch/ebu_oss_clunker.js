const beamy = require('beamcoder')
const macadam = require('macadam')
const nodencl = require('nodencl');
const rgbyuv = require('../process/rgbyuvPacker.js');
const v210_io = require('../process/v210_io.js');
const yuv422p10_io = require('../process/yuv422p10_io.js')
const fs = require('fs').promises;
const osc = require('osc')

const testImage = `
__constant sampler_t sampler1 =
      CLK_NORMALIZED_COORDS_FALSE
    | CLK_ADDRESS_CLAMP_TO_EDGE
    | CLK_FILTER_NEAREST;

__constant sampler_t sampler2 =
      CLK_NORMALIZED_COORDS_FALSE
    | CLK_ADDRESS_CLAMP_TO_EDGE
    | CLK_FILTER_NEAREST;

__kernel void
  testImage(__read_only image2d_t input1,
						__read_only image2d_t input2,
						float fl,
            __write_only image2d_t output) {

    int x = get_global_id(0);
    int y = get_global_id(1);
    float4 in1 = read_imagef(input1, sampler1, (int2)(x,y));
		float4 in2 = read_imagef(input2, sampler2, (int2)(x,y));
		float rl = 1.0f - fl;
    write_imagef(output, (int2)(x, y),
			(float4)(fl * in1.s0 + rl * in2.s0, fl * in1.s1 + rl * in2.s1, fl * in1.s2 + rl * in2.s2, 1.0f));
  }
`;

async function run() {
	const platformIndex = 0;
	const deviceIndex = 0;
	const context = new nodencl.clContext({
		platformIndex: platformIndex,
		deviceIndex: deviceIndex
	});
	const platformInfo = await context.getPlatformInfo();
	// console.log(JSON.stringify(platformInfo, null, 2));
	console.log(platformInfo.vendor, platformInfo.devices[deviceIndex].type);

	const colSpecRead = '709';
	const colSpecWrite = '709';
	const width = 1920;
	const height = 1080;

	const yuv422p10Loader1 = new rgbyuv.yuvLoader(context, colSpecRead, colSpecWrite, new yuv422p10_io.reader(width, height));
  await yuv422p10Loader1.init();
	const yuv422p10Loader2 = new rgbyuv.yuvLoader(context, colSpecRead, colSpecWrite, new yuv422p10_io.reader(width, height));
  await yuv422p10Loader2.init();

  const v210Saver = new rgbyuv.yuvSaver(context, colSpecWrite, new v210_io.writer(width, height));
  await v210Saver.init();

	// const globalWorkItems = Uint32Array.from([ width, height ]);
	const testImageProgram = await context.createProgram(testImage, {
		globalWorkItems: Uint32Array.from([ width, height ])
	});

	const lumaBytes = yuv422p10_io.getPitchBytes(width) * height;
  const chromaBytes = lumaBytes / 2;
	const numBytesV210 = v210_io.getPitchBytes(width) * height;

	const srcs1 = [
    await context.createBuffer(lumaBytes, 'readonly', 'coarse'),
    await context.createBuffer(chromaBytes, 'readonly', 'coarse'),
    await context.createBuffer(chromaBytes, 'readonly', 'coarse')
  ];
	const srcs2 = [
		await context.createBuffer(lumaBytes, 'readonly', 'coarse'),
		await context.createBuffer(chromaBytes, 'readonly', 'coarse'),
		await context.createBuffer(chromaBytes, 'readonly', 'coarse')
	];

	const numBytesRGBA = width * height * 4 * 4;
	const rgbaDst1 = await context.createBuffer(numBytesRGBA, 'readwrite', 'coarse');
	const rgbaDst2 = await context.createBuffer(numBytesRGBA, 'readwrite', 'coarse');
	const imageDst = await context.createBuffer(numBytesRGBA, 'readwrite', 'coarse');

	const v210Dst = await context.createBuffer(numBytesV210, 'writeonly', 'coarse');

	let playback = await macadam.playback({
  	deviceIndex: 0, // Index relative to the 'macadam.getDeviceInfo()' array
  	displayMode: macadam.bmdModeHD1080i50,
  	pixelFormat: macadam.bmdFormat10BitYUV
	})

	async function processFrame(b1, b2, fl) {
		let res = []
		await Promise.all([
			srcs1[0].hostAccess('writeonly', b1[0].slice(0, lumaBytes)),
	  	srcs1[1].hostAccess('writeonly', b1[1].slice(0, chromaBytes)),
	  	srcs1[2].hostAccess('writeonly', b1[2].slice(0, chromaBytes)),
			srcs2[0].hostAccess('writeonly', b2[0].slice(0, lumaBytes)),
			srcs2[1].hostAccess('writeonly', b2[1].slice(0, chromaBytes)),
			srcs2[2].hostAccess('writeonly', b2[2].slice(0, chromaBytes)) ]);
		[ res[0], res[1] ] = await Promise.all([
			yuv422p10Loader1.fromYUV({ sources: srcs1, dest: rgbaDst1 }),
			yuv422p10Loader2.fromYUV({ sources: srcs2, dest: rgbaDst2 }) ]);
		//await rgbaDst.hostAccess('readonly')
		// dumpFloatBuf(rgbaDst, 1920, 2, 4);
		res[2] = await testImageProgram.run({input1: rgbaDst1, input2: rgbaDst2, fl: fl, output: imageDst})
		//await imageDst.hostAccess('readonly')
		// dumpFloatBuf(imageDst, 1920, 2, 4);
		res[3] = await v210Saver.toYUV({ source: imageDst, dest: v210Dst })
		await v210Dst.hostAccess('readonly')
		// v210_io.dumpBuf(v210Dst, 1920, 4);
		// console.log(process.hrtime(lstamp))
		return res;
	}

	async function waitForIt (t) {
		return new Promise((resolve, reject) => {
			setTimeout(resolve, t > 0 ? t : 0)
		})
	}

	let start = process.hrtime();

	let dm1 = await beamy.demuxer('file:../media/dpp/AS11_DPP_HD_EXAMPLE_1.mxf')
	await dm1.seek({ time: 240.0 })
	let dec1 = await beamy.decoder({ demuxer: dm1, stream_index: 0 })
	let dm2 = await beamy.demuxer('file:../media/dpp/AS11_DPP_HD_EXAMPLE_1.mxf')
	await dm2.seek({ time: 360.0 })
	let dec2 = await beamy.decoder({ demuxer: dm1, stream_index: 0 })

	async function read1() {
		let p = await dm1.read()
		if (p.stream_index === 0) return p
		return read1()
	}

	async function read2() {
		let p = await dm2.read()
		if (p.stream_index === 0) return p
		return read2()
	}

	let fl = 0.5

	const oscUdp = new osc.UDPPort({
    localAddress: "0.0.0.0",
    localPort: 9876
	});
	oscUdp.on("message", function (oscMessage) {
		// console.log(oscMessage.address)
    if (oscMessage.address === '/1/fader1') {
			fl = oscMessage.args[0]
			// console.log(fl)
		}
	});
	oscUdp.open();

	let result = []
	let counter = 0

	while (true) {
		let work = []
		let stamp = process.hrtime();
		work[0] = Promise.all([read1(), read2()]) // add to clunker
		if (result.length >= 1) {
			work[1] = Promise.all([dec1.decode(result[0][0]), dec2.decode(result[0][1])])
		}
		if (result.length >= 2) {
			work[2] = processFrame(result[1][0].frames[0].data, result[1][1].frames[0].data, fl)
		}
		if (result.length >= 3) {
			work[3] = playback.displayFrame(v210Dst)
		}
		// console.log(work)
		result = await Promise.all(work)
		let diff = process.hrtime(start)
		let wait = (counter * 40) - ((diff[0] * 1000) + (diff[1] / 1000000 | 0) )
		await waitForIt(wait)
		console.log(`Clunk ${counter++} completed in ${process.hrtime(stamp)} waiting ${wait}`)
	}
}

run().catch(console.error)
