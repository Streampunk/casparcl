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
const rgbyuv = require('../process/rgbyuvPacker.js');
const v210_io = require('../process/v210_io.js');

function dumpFloatBuf(buf, width, numPixels, numLines) {
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

  const v210Loader = new rgbyuv.yuvLoader(context, colSpecRead, colSpecWrite, new v210_io.reader(width, height));
  await v210Loader.init();

  const v210Saver = new rgbyuv.yuvSaver(context, colSpecWrite, new v210_io.writer(width, height));
  await v210Saver.init();

  const numBytesV210 = v210_io.getPitchBytes(width) * height;
  const v210Src = await context.createBuffer(numBytesV210, 'readonly', 'coarse');

  const numBytesRGBA = width * height * 4 * 4;
  const rgbaDst = await context.createBuffer(numBytesRGBA, 'readwrite', 'coarse');

  const v210Dst = await context.createBuffer(numBytesV210, 'writeonly', 'coarse');

  await v210Src.hostAccess('writeonly');
  v210_io.fillBuf(v210Src, width, height);
  v210_io.dumpBuf(v210Src, width, 4);

  let timings = await v210Loader.fromYUV({ source: v210Src, dest: rgbaDst });
  console.log(`${timings.dataToKernel}, ${timings.kernelExec}, ${timings.dataFromKernel}, ${timings.totalTime}`);

  await rgbaDst.hostAccess('readonly');
  dumpFloatBuf(rgbaDst, width, 2, 4);

  timings = await v210Saver.toYUV({ source: rgbaDst, dest: v210Dst });
  console.log(`${timings.dataToKernel}, ${timings.kernelExec}, ${timings.dataFromKernel}, ${timings.totalTime}`);

  await v210Dst.hostAccess('readonly');
  v210_io.dumpBuf(v210Dst, width, 4);

  await v210Src.hostAccess('readonly');
  console.log('Compare returned', v210Src.compare(v210Dst));

  return [v210Src, v210Dst];
}
noden()
  .then(([i, o]) => [i.creationTime, o.creationTime])
  .then(([ict, oct]) => { if (global.gc) global.gc(); console.log(ict, oct); })
  .catch(console.error);
