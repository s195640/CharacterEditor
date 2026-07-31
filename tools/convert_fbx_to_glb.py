"""Convert a Mixamo FBX export (mesh/skeleton + baked animation) to GLB.

Run headlessly with Blender:
    blender --background --python tools/convert_fbx_to_glb.py -- <input.fbx> <output.glb> <clip_name>

clip_name renames the imported action before export. Mixamo always names the
action "Armature|mixamo.com|Layer0" regardless of which animation you picked,
so without this, loading multiple clips onto one Babylon.js skeleton via
ImportAnimationsAsync collides on that shared name and overwrites the
previous clip instead of adding to it.
"""

import sys
import bpy

argv = sys.argv[sys.argv.index("--") + 1:]
input_fbx, output_glb, clip_name = argv[0], argv[1], argv[2]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=input_fbx)

for action in bpy.data.actions:
    action.name = clip_name

bpy.ops.export_scene.gltf(
    filepath=output_glb,
    export_format="GLB",
    export_animations=True,
)
