"""Author a placeholder equipment mesh skinned to an existing Mixamo skeleton.

Imports a reference FBX (skeleton only, e.g. an "Without Skin" Mixamo export)
to get the exact armature -- reusing it directly, rather than creating a new
one, is what guarantees the exported equipment glTF shares the same bone order
as the character's own skeleton. A small sphere is created at the target
bone's rest position, skinned 100% to that bone, and exported alongside the
full armature.

Run headlessly with Blender:
    blender --background --python tools/make_equipment_placeholder.py -- <reference.fbx> <output.glb> <bone_name>
"""

import sys
import bpy

argv = sys.argv[sys.argv.index("--") + 1:]
reference_fbx, output_glb, bone_name = argv[0], argv[1], argv[2]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=reference_fbx)
armature = [o for o in bpy.data.objects if o.type == "ARMATURE"][0]

bone_head_local = armature.data.bones[bone_name].head_local
world_position = armature.matrix_world @ bone_head_local

bpy.ops.mesh.primitive_uv_sphere_add(radius=0.12, location=world_position)
mesh_obj = bpy.context.active_object
mesh_obj.name = "Helmet"

vertex_group = mesh_obj.vertex_groups.new(name=bone_name)
vertex_group.add(range(len(mesh_obj.data.vertices)), 1.0, "REPLACE")

mesh_obj.parent = armature
mesh_obj.matrix_parent_inverse = armature.matrix_world.inverted()

modifier = mesh_obj.modifiers.new(name="Armature", type="ARMATURE")
modifier.object = armature

bpy.ops.object.select_all(action="DESELECT")
mesh_obj.select_set(True)
armature.select_set(True)

bpy.ops.export_scene.gltf(
    filepath=output_glb,
    export_format="GLB",
    use_selection=True,
    export_animations=False,
)
