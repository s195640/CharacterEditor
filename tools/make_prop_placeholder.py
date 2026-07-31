"""Author a placeholder rigid prop mesh (e.g. a sword), unskinned.

Unlike make_equipment_placeholder.py, this has no armature and no skinning --
rigid props (weapons, shields) attach to a single bone at runtime via
Babylon's attachToBone, not via a shared skeleton. The mesh is built spanning
world Z from 0 to `length`, with its origin left at (0, 0, 0) -- the grip
end -- since attachToBone treats the mesh's own position/rotation as an
offset from the bone it's attached to.

Run headlessly with Blender:
    blender --background --python tools/make_prop_placeholder.py -- <output.glb> <length>
"""

import sys
import bpy

argv = sys.argv[sys.argv.index("--") + 1:]
output_glb = argv[0]
length = float(argv[1]) if len(argv) > 1 else 0.6

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.mesh.primitive_cube_add(size=1)
mesh_obj = bpy.context.active_object
mesh_obj.name = "Sword"
mesh_obj.scale = (0.03, 0.03, length)
mesh_obj.location = (0, 0, length / 2)
bpy.ops.object.transform_apply(location=True, rotation=False, scale=True)

bpy.ops.export_scene.gltf(
    filepath=output_glb,
    export_format="GLB",
    export_animations=False,
)
