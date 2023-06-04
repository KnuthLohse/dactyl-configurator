import type { Manifold } from 'manifold-3d'
import { Vector3 } from 'three/src/math/Vector3'

const NEEDS_SUPPORT_ANGLE = Math.PI/6 // angles of > 30 degrees need support
const SUPPORT_THRESH = -Math.sin(NEEDS_SUPPORT_ANGLE) // faces with normal.z < thresh need support

export function supportManifold(m: Manifold) {
    const mesh = m.getMesh()
    const eps = m.precision() // for determining if things are approximately zero

    const cb = new Vector3();
    const ab = new Vector3();

    // Collect an array of vertices
    const pos: Vector3[] = []
    for (let i = 0; i < mesh.vertProperties.length; i += 3) {
        pos.push(new Vector3().fromArray(mesh.vertProperties, i))
    }

    const boundary = new Set()
    const faces = []
    const faceNorms = []
    let volume = 0

    // Iterate through triangles.
    // Extrude triangles that need supporting down to the build
    for (let t = 0; t < mesh.triVerts.length; t += 3) {
        const tri = mesh.triVerts.slice(t, t+3)

        cb.subVectors(pos[tri[2]], pos[tri[1]]);
        ab.subVectors(pos[tri[0]], pos[tri[1]]);
        cb.cross(ab).normalize() // cb is now the normal vector

        if (cb.z > SUPPORT_THRESH) continue // Only use faces that are facing downwards
        if (cb.z < -(1 - eps) && pos[tri[0]].z < eps) continue // Don't use faces on the ground

        faces.push(tri)
        faceNorms.push(new Vector3().copy(cb).negate())

        const vAb = new Vector3(pos[tri[0]].x, pos[tri[0]].y, 0)
        const vBb = new Vector3(pos[tri[1]].x, pos[tri[1]].y, 0)
        const vCb = new Vector3(pos[tri[2]].x, pos[tri[2]].y, 0)

        volume += polyhendronVolume([
            [pos[tri[2]], pos[tri[1]], pos[tri[0]]],
            [vAb, vBb, vCb],
            [pos[tri[0]], pos[tri[1]], vAb],
            [vBb, vAb, pos[tri[1]]],
            [pos[tri[1]], pos[tri[2]], vBb],
            [vCb, vBb, pos[tri[2]]],
            [pos[tri[2]], pos[tri[0]], vCb],
            [vAb, vCb, pos[tri[0]]],
        ])

        for (const [e0, e1] of [[tri[0], tri[1]], [tri[1], tri[2]], [tri[2], tri[0]]]) {
            if (boundary.has(e1 + ',' + e0)) {
                boundary.delete(e1 + ',' + e0)
            } else {
                boundary.add(e0 + ',' + e1)
            }
        }
    }

    const vertices = new Float32Array(mesh.triVerts.length*18 + boundary.size*18)
    const normals = new Float32Array(mesh.triVerts.length*18 + boundary.size*18)

    // Add the top and bottom faces
    faces.forEach((tri, i) => {
        const vA = pos[tri[0]], vB = pos[tri[1]], vC = pos[tri[2]]
        const fn = faceNorms[i]
        // Add top face
        vertices.set([vC.x, vC.y, vC.z, vB.x, vB.y, vB.z, vA.x, vA.y, vA.z], i*18)
        normals.set([fn.x, fn.y, fn.z, fn.x, fn.y, fn.z, fn.x, fn.y, fn.z], i*18)
        // Add botom face
        vertices.set([vA.x, vA.y, 0, vB.x, vB.y, 0, vC.x, vC.y, 0], i*18+9)
        normals.set([0, 0, -1, 0, 0, -1, 0, 0, -1], i*18+9)
    })

    function addFace(a: Vector3, b: Vector3, c: Vector3, offset: number) {
        cb.subVectors(c, b);
        ab.subVectors(a, b);
        cb.cross(ab).normalize() // cb is now the normal vector

        vertices.set([a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z], offset)
        normals.set([cb.x, cb.y, cb.z, cb.x, cb.y, cb.z, cb.x, cb.y, cb.z], offset)
    }

    [...boundary].forEach((b, i) => {
        const [e0, e1] = b.split(',').map(v => +v)
        addFace(pos[e0], pos[e1], new Vector3(pos[e0].x, pos[e0].y, 0), mesh.triVerts.length*18 + i*18)
        addFace(new Vector3(pos[e1].x, pos[e1].y, 0), new Vector3(pos[e0].x, pos[e0].y, 0), pos[e1], mesh.triVerts.length*18 + i*18+9)
    })

    return { vertices, normals, volume }
}

/** Return the volume of a polyhedron made up of triangle faces. */
function polyhendronVolume(faces: Vector3[][]) {
    let volume = 0;

    const cb = new Vector3();
    const ab = new Vector3();

    for (const face of faces) {
        cb.subVectors(face[2], face[1]);
        ab.subVectors(face[0], face[1]);
        volume += cb.cross(ab).dot(face[0])
    }
    return volume / 6;
}
