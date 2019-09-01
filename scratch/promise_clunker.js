const beamy = require('beamcoder')
const macadam = require('macadam')
const nodencl = require('nodencl');
const v210_io = require('./v210_io.js');

const testImage = `
__constant sampler_t sampler =
      CLK_NORMALIZED_COORDS_FALSE
    | CLK_ADDRESS_CLAMP_TO_EDGE
    | CLK_FILTER_NEAREST;

__kernel void
  testImage(__read_only image2d_t input,
            __write_only image2d_t output) {

    int x = get_global_id(0);
    int y = get_global_id(1);
    float4 in = read_imagef(input, sampler, (int2)(x,y));
    write_imagef(output, (int2)(x, y), in);
  }
`;

async function run() {
	const platformIndex = 1;
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

	const v210Reader = new v210_io.reader(context, width, height, colSpecRead, colSpecRead);
	await v210Reader.init();

	const v210Writer = new v210_io.writer(context, width, height, colSpecWrite);
	await v210Writer.init();

	// const globalWorkItems = Uint32Array.from([ width, height ]);
	const testImageProgram = await context.createProgram(testImage, {
		globalWorkItems: Uint32Array.from([ width, height ])
	});

	const numBytesV210 = v210_io.getPitchBytes(width) * height;
	const v210Src = await context.createBuffer(numBytesV210, 'readonly', 'coarse');

	const numBytesRGBA = width * height * 4 * 4;
	const rgbaDst = await context.createBuffer(numBytesRGBA, 'readwrite', 'coarse');
	const imageDst = await context.createBuffer(numBytesRGBA, 'readwrite', 'coarse');

	const v210Dst = await context.createBuffer(numBytesV210, 'writeonly', 'coarse');

	let dm = await beamy.demuxer('file:../media/dpp/AS11_DPP_HD_EXAMPLE_1.mxf')
	console.log(dm)
	let dec = await beamy.decoder({ demuxer: dm, stream_index: 0 })
	let enc = beamy.encoder({ name: 'v210', codec_id: 127, width: 1920, height: 1080, pix_fmt: 'yuv422p10le', bits_per_raw_sample: 20, time_base: [ 1, 25 ] })
	console.log(enc)

	let playback = await macadam.playback({
  	deviceIndex: 0, // Index relative to the 'macadam.getDeviceInfo()' array
  	displayMode: macadam.bmdModeHD1080i50,
  	pixelFormat: macadam.bmdFormat10BitYUV
	})

	let result = []
	let counter = 0

	async function read() {
		let p = await dm.read()
		if (p.stream_index === 0) return p
		return read()
	}

	async function processFrame(b) {
		let res = []
		await v210Src.hostAccess('writeonly')
		let lstamp = process.hrtime()
		b.copy(v210Src)
		res[0] = await v210Reader.fromV210(v210Src, rgbaDst)
		//await rgbaDst.hostAccess('readonly')
		// dumpFloatBuf(rgbaDst, 1920, 2, 4);
		res[1] = await testImageProgram.run({input: rgbaDst, output: imageDst})
		//await imageDst.hostAccess('readonly')
		// dumpFloatBuf(imageDst, 1920, 2, 4);
		res[2] = await v210Writer.toV210(imageDst, v210Dst)
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

	while (true) {
		let work = []
		let stamp = process.hrtime();
		let p = await read()
		if (result.length >= 1) {
			work[1] = enc.encode(result[0].frames[0])
		}
		if (result.length >= 2) {
			work[2] = processFrame(result[1].packets[0].data)
		}
		if (result.length >= 3) {
			work[3] = playback.displayFrame(v210Dst)
		}
		work[0] = dec.decode(p)
		// console.log(work)
		result = await Promise.all(work)
		let diff = process.hrtime(start)
		let wait = (counter * 40) - ((diff[0] * 1000) + (diff[1] / 1000000 | 0) )
		await waitForIt(wait)
		console.log(`Clunk ${counter++} completed in ${process.hrtime(stamp)} waiting ${wait}`)
	}
}

run()
