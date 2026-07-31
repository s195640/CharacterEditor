"""Convert a Mixamo FBX export (mesh + skeleton + baked animation) to GLB.

Run headlessly with Blender:
    blender --background --python tools/convert_fbx_to_glb.py -- <input.fbx> <output.glb>
"""

import sys
import bpy

argv = sys.argv[sys.argv.index("--") + 1:]
input_fbx, output_glb = argv[0], argv[1]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=input_fbx)
bpy.ops.export_scene.gltf(
    filepath=output_glb,
    export_format="GLB",
    export_animations=True,
)
