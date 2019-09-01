const beamy = require('beamcoder')
const macadam = require('macadam')
const nodencl = require('nodencl');
const v210_io = require('./v210_io.js');
const fs = require('fs').promises;

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

	const v210Reader = new v210_io.reader(context, width, height, colSpecRead, colSpecRead);
	await v210Reader.init();

	const v210Writer = new v210_io.writer(context, width, height, colSpecWrite);
	await v210Writer.init();

	// const globalWorkItems = Uint32Array.from([ width, height ]);
	const testImageProgram = await context.createProgram(testImage, {
		globalWorkItems: Uint32Array.from([ width, height ])
	});

	const numBytesV210 = v210_io.getPitchBytes(width) * height;
	const v210Src1 = await context.createBuffer(numBytesV210, 'readonly', 'coarse');
	const v210Src2 = await context.createBuffer(numBytesV210, 'readonly', 'coarse');

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

	async function processFrame(b1, b2) {
		let res = []
		await v210Src1.hostAccess('writeonly')
		b1.copy(v210Src1)
		await v210Src2.hostAccess('writeonly')
		b2.copy(v210Src2)
		res[0] = await v210Reader.fromV210(v210Src1, rgbaDst1)
		res[1] = await v210Reader.fromV210(v210Src2, rgbaDst2)
		//await rgbaDst.hostAccess('readonly')
		// dumpFloatBuf(rgbaDst, 1920, 2, 4);
		res[2] = await testImageProgram.run({input1: rgbaDst1, input2: rgbaDst2, fl: +process.argv[2], output: imageDst})
		//await imageDst.hostAccess('readonly')
		// dumpFloatBuf(imageDst, 1920, 2, 4);
		res[3] = await v210Writer.toV210(imageDst, v210Dst)
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

	let frameList1 = await fs.readdir('../media/EBU_test_sets/filexchange.ebu.ch/EBU test sets - Creative Commons (BY-NC-ND)/HDTV test sequences/1080i25/Graphics_1080i_/Graphics_1080i_')
	frameList1 = frameList1.filter(f => f.endsWith('v210'))
	let frameList2 = await fs.readdir('../media/EBU_test_sets/filexchange.ebu.ch/EBU test sets - Creative Commons (BY-NC-ND)/HDTV test sequences/1080i25/girlflower1_1080i_/girlflower1_1080i_')
	frameList2 = frameList2.filter(f => f.endsWith('v210'))
	console.log(frameList2)

	let counter = 0
	let data1 = Buffer.alloc(5529600)
	let data2 = Buffer.alloc(5529600)

	while (true) {
		let stamp = process.hrtime();
		let fh1 = await fs.open('../media/EBU_test_sets/filexchange.ebu.ch/EBU test sets - Creative Commons (BY-NC-ND)/HDTV test sequences/1080i25/Graphics_1080i_/Graphics_1080i_/' + frameList1[counter % frameList1.length], 'r')
		let fh2 = await fs.open('../media/EBU_test_sets/filexchange.ebu.ch/EBU test sets - Creative Commons (BY-NC-ND)/HDTV test sequences/1080i25/girlflower1_1080i_/girlflower1_1080i_/' + frameList2[counter % frameList2.length], 'r')
		await Promise.all([fh1.read(data1, 0, data1.length, 0), fh2.read(data2, 0, data2.length, 0)])
		await fh1.close()
		await fh2.close()
		await processFrame(data1, data2)
		await playback.displayFrame(v210Dst)
		let diff = process.hrtime(start)
		let wait = (counter * 40) - ((diff[0] * 1000) + (diff[1] / 1000000 | 0) )
		await waitForIt(wait)
		console.log(`Clunk ${counter++} completed in ${process.hrtime(stamp)} waiting ${wait}`)
	}
}

run()
