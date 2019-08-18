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
