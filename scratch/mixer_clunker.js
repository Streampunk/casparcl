const beamy = require('beamcoder')
const macadam = require('macadam')
const nodencl = require('nodencl');
const rgbyuv = require('../process/rgbyuvPacker.js');
const v210_io = require('../process/v210_io.js');
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

// const testImage = `
// __constant sampler_t smp =
//       CLK_NORMALIZED_COORDS_FALSE
//     | CLK_ADDRESS_CLAMP_TO_EDGE
//     | CLK_FILTER_NEAREST;
//
// __kernel void mix(
// __read_only image2d_t s1, __read_only image2d_t s2, float l, __write_only image2d_t d) {
//  int2 p=(int2)(get_global_id(0),get_global_id(1));
//  float4 i=read_imagef(s1,smp,p);
//  float4 j=read_imagef(s2,smp,p);
//  float r=1-l;
//  write_imagef(d,p,(float4)(l*i.s0+r*j.s0,l*i.s1+r*j.s1,l*i.s2+r*j.s2,1.0f));
// }
// `;

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

	const v210Loader1 = new rgbyuv.yuvLoader(context, colSpecRead, colSpecWrite, new v210_io.reader(width, height));
  await v210Loader1.init();
	const v210Loader2 = new rgbyuv.yuvLoader(context, colSpecRead, colSpecWrite, new v210_io.reader(width, height));
  await v210Loader2.init();

  const v210Saver = new rgbyuv.yuvSaver(context, colSpecWrite, new v210_io.writer(width, height));
  await v210Saver.init();

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

	async function processFrame(b1, b2, fl) {
		let res = []
		await v210Src1.hostAccess('writeonly', b1)
		await v210Src2.hostAccess('writeonly', b2)
		res[0] = await v210Loader1.fromYUV({ source: v210Src1, dest: rgbaDst1 })
		res[1] = await v210Loader2.fromYUV({ source: v210Src2, dest: rgbaDst2 })
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

	let frameList1 = await fs.readdir('../media/EBU_test_sets/filexchange.ebu.ch/EBU test sets - Creative Commons (BY-NC-ND)/HDTV test sequences/1080i25/Graphics_1080i_/Graphics_1080i_')
	frameList1 = frameList1.filter(f => f.endsWith('v210'))
	let frameList2 = await fs.readdir('../media/EBU_test_sets/filexchange.ebu.ch/EBU test sets - Creative Commons (BY-NC-ND)/HDTV test sequences/1080i25/girlflower1_1080i_/girlflower1_1080i_')
	frameList2 = frameList2.filter(f => f.endsWith('v210'))
	console.log(frameList2)

	let counter = 0
	let data1 = Buffer.alloc(5529600)
	let data2 = Buffer.alloc(5529600)

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
	oscUdp.open()

	while (true) {
		let fh1 = await fs.open('../media/EBU_test_sets/filexchange.ebu.ch/EBU test sets - Creative Commons (BY-NC-ND)/HDTV test sequences/1080i25/Graphics_1080i_/Graphics_1080i_/' + frameList1[counter % frameList1.length], 'r')
		let fh2 = await fs.open('../media/EBU_test_sets/filexchange.ebu.ch/EBU test sets - Creative Commons (BY-NC-ND)/HDTV test sequences/1080i25/girlflower1_1080i_/girlflower1_1080i_/' + frameList2[counter % frameList2.length], 'r')
		await Promise.all([fh1.read(data1, 0, data1.length, 0), fh2.read(data2, 0, data2.length, 0)])
		await fh1.close()
		await fh2.close()
		let stamp = process.hrtime()
		await processFrame(data1, data2, fl)
		let total = process.hrtime(stamp)
		await playback.displayFrame(v210Dst)
		let diff = process.hrtime(start)
		let wait = (counter * 40) - ((diff[0] * 1000) + (diff[1] / 1000000 | 0) )
		await waitForIt(wait)
		console.log(`Clunk ${counter++} completed in ${total} waiting ${wait}`)
	}
}

run().catch(console.error)
