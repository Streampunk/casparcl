# CasparCL

From the perspective of 2020 tech rather than 2000 tech, this is an experimentat to see what happens if the popular open-source graphics engine CasparCG is re-cast using different tools and architecture. This aim is to answer the following questions:

* Can you implement 80%+ of the features using GPGPU techniques, decoupling the work done from limitations of OpenGL texture formats?
* Can you make something like CasparCG that is both very low-latency (aiming for less than 2 frames end-to-end on current hardware) and HDR ready (10-bit plus, floating point, BT709 and BT2020)?
* Can you open up the data model to be more flexible and less coupled to SDI?

Using Node.js as the glue platform, the plan is mash up some existing technical components and see what happens:

* Beamcoder native bindings to FFmpeg for demuxing, decoding, encoding and muxing. Possibly for access to some devices as well.
* NodenCL - an experiment in using OpenCL from Node for mixing and graphics rendering with floating point values.
* Highland.js to provide reactive streams over the previous two Promise-based libraries.
* CasparCG code and components where appropriate, e.g. CEF for HTML rendering, following how the shaders are used, flash rendering.
* SuperFly.tv CasparCG Connection library - a controlled way of getting from Node to Caspar.

Experiments don't necessarily pan out. Resource is limited. Don't expect miracles. Watch this space!

## Updates

### 3rd November 2019

Progress has been made since we set out on this project. See the video of a vision mixer built on this stack from the [EBU Open Source event 2019](https://tech.ebu.ch/home/publications/main/section-publication-main/section-publication-main/publicationList/2019/09/24/streampunk-beamcoder.html).

* NodenCL working well on Nvidia and Intel GPUs ... typically significatly less than 25ms per frame on the GPU. Work is ongoing to optimise for AMD.
* 10-bit YUV planar support added to NodenCL for integration with Beamcoder. 
* sRGB colourspace support added in and out with support for raw 8-bit RGBA and BGRA.
* [Elecular](https://github.com/Streampunk/elecular) project uses Electron as a headless graphics renderer for [Singular.live](https://www.singular.live/) graphics and Chrome browser as a previewer with HTTP interfaces.
* Basic compositing of graphics demonstrated ... compositing preserves 10-bit pictures end-to-end, even though the graphics are 8-bit.
* Highland not working well with Promises - failing to overlap async processing. A different approach is required ...

Current work includes:

* Writing a library for Node like Highland that works well with promises over media streams. This is a reworking of the [Redioactive](https://github.com/Streampunk/node-red-contrib-dynamorse-core/blob/master/util/Redioactive.js) component inside [dynamorse](https://github.com/Streampunk/node-red-contrib-dynamorse-core).
* Multi-layer compositing.
* AMD GPU optimisations.

Next steps:

* Quick and dirty _factor of 2_ scaling up and down.
* Mixer operations similar to those from CasparCG - including arbitrary scaling
* Bolting AMCP on the front of the stack.
* HTTP/S optimisations based around [arachnid](https://github.com/Streampunk/arachnid).

### 3rd February 2020

In the last 3 months:

* NodenCL has been improved using pipelining. By defining a local processing graph, each of copy to the GPU, copy from the GPU and processing can be overlapped to run in parallel. Working well on AMD and nVidia GPUs.
* Typescript definitions now available for NodenCL and Beamcoder
* Realtime quarter-size previews in a browser web canvas. Uncompressed with correct sRGB colors.
* Prototype mixing and compositing functions, including arbitrary scaling, flipping, positioning. 10-bit video colour on input is preserved through the composite to the output.
* Checking everything is working on Node 12.
* Redioactive is working. Some further development required to add all higher-order features including splitting and joining streams.

Still to come:

* Bolting AMCP-_lite_ on the front of the stack.
* Productising CasparCL - a MVP towards a realease.

![CasparCL stack](/caspar_stack.png)






