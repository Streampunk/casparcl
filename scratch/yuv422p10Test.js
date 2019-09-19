/* Copyright 2018 Streampunk Media Ltd.

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
const rgbyuv = require('../process/rgbyuvPacker.js');
const yuv422p10_io = require('../process/yuv422p10_io.js');

function dumpFloatBuf(buf, width, height, numPixels, numLines) {
  const r = (b, o) => b.readFloatLE(o).toFixed(4);
  for (let y=0; y<numLines; ++y) {
    const off = y*width*4*4;
    let s = `Line ${y}: ${r(buf, off)}`;
    for (let i=1; i<numPixels*4; ++i)
      s += `, ${r(buf, off+i*4)}`;
    console.log(s);
  }
}

async function noden() {
  const platformIndex = 1;
  const deviceIndex = 0;
  const context = new addon.clContext({
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

  const yuv422p10Loader = new rgbyuv.yuvLoader(context, colSpecRead, colSpecWrite, new yuv422p10_io.reader(width, height));
  await yuv422p10Loader.init();

  const yuv422p10Saver = new rgbyuv.yuvSaver(context, colSpecWrite, new yuv422p10_io.writer(width, height));
  await yuv422p10Saver.init();

  const lumaBytes = yuv422p10_io.getPitchBytes(width) * height;
  const chromaBytes = lumaBytes / 2;
  const numBytesyuv422p10 = yuv422p10_io.getTotalBytes(width, height);
  const yuv422p10Src = Buffer.allocUnsafe(numBytesyuv422p10);
  yuv422p10_io.fillBuf(yuv422p10Src, width, height);
  yuv422p10_io.dumpBuf(yuv422p10Src, width, height, 4);

  const srcs = [
    await context.createBuffer(lumaBytes, 'readonly', 'coarse'),
    await context.createBuffer(chromaBytes, 'readonly', 'coarse'),
    await context.createBuffer(chromaBytes, 'readonly', 'coarse')
  ];
  await srcs[0].hostAccess('writeonly', yuv422p10Src.slice(0, lumaBytes));
  await srcs[1].hostAccess('writeonly', yuv422p10Src.slice(lumaBytes, lumaBytes + chromaBytes));
  await srcs[2].hostAccess('writeonly', yuv422p10Src.slice(lumaBytes + chromaBytes, lumaBytes + chromaBytes * 2));

  const numBytesRGBA = width * height * 4 * 4;
  const rgbaDst = await context.createBuffer(numBytesRGBA, 'readwrite', 'coarse');

  const dsts = [
    await context.createBuffer(lumaBytes, 'writeonly', 'coarse'),
    await context.createBuffer(chromaBytes, 'writeonly', 'coarse'),
    await context.createBuffer(chromaBytes, 'writeonly', 'coarse'),
  ];

  let timings = await yuv422p10Loader.fromYUV({ sources: srcs, dest: rgbaDst });
  console.log(`${timings.dataToKernel}, ${timings.kernelExec}, ${timings.dataFromKernel}, ${timings.totalTime}`);

  await rgbaDst.hostAccess('readonly');
  dumpFloatBuf(rgbaDst, width, height, 2, 4);

  timings = await yuv422p10Saver.toYUV({ source: rgbaDst, dests: dsts });
  console.log(`${timings.dataToKernel}, ${timings.kernelExec}, ${timings.dataFromKernel}, ${timings.totalTime}`);

  await dsts[0].hostAccess('readonly');
  await dsts[1].hostAccess('readonly');
  await dsts[2].hostAccess('readonly');
  const yuv422p10Dst = Buffer.concat(dsts, numBytesyuv422p10);
  yuv422p10_io.dumpBuf(yuv422p10Dst, width, height, 4);

  await srcs[0].hostAccess('readonly');
  await srcs[1].hostAccess('readonly');
  await srcs[2].hostAccess('readonly');
  console.log('Compare returned', yuv422p10Src.compare(yuv422p10Dst));

  return [srcs[0], dsts[0]];
}
noden()
  .then(([i, o]) => [i.creationTime, o.creationTime])
  .then(([ict, oct]) => { if (global.gc) global.gc(); console.log(ict, oct); })
  .catch(console.error);
