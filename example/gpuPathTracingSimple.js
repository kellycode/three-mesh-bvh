import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Stats from 'stats.js';
import { GUI } from 'dat.gui';
import {
	MeshBVH, MeshBVHUniformStruct, FloatVertexAttributeTexture,
	shaderStructs, shaderIntersectFunction, SAH,
} from '../src/index.js';
import {
	FullScreenQuad,
} from 'three/examples/jsm/postprocessing/Pass.js';

const params = {
	enableRaytracing: true,
	animate: true,
	resolutionScale: 2,
	smoothNormals: true,
};

let renderer, camera, scene, gui, stats;
let rtQuad, mesh, clock;

init();
render();

function init() {

	// renderer setup
	renderer = new THREE.WebGLRenderer( { antialias: false } );
	renderer.setPixelRatio( window.devicePixelRatio );
	renderer.setClearColor( 0x09141a );
	renderer.setSize( window.innerWidth, window.innerHeight );
	renderer.outputEncoding = THREE.sRGBEncoding;
	document.body.appendChild( renderer.domElement );

	// scene setup
	scene = new THREE.Scene();

	const light = new THREE.DirectionalLight( 0xffffff, 1 );
	light.position.set( 1, 1, 1 );
	scene.add( light );
	scene.add( new THREE.AmbientLight( 0xb0bec5, 0.5 ) );

	// camera setup
	camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 50 );
	camera.position.set( 0, 0, 4 );
	camera.far = 100;
	camera.updateProjectionMatrix();

	// stats setup
	stats = new Stats();
	document.body.appendChild( stats.dom );

	const knotGeometry = new THREE.TorusKnotBufferGeometry( 1, 0.3, 300, 50 );
	const bvh = new MeshBVH( knotGeometry, { maxLeafTris: 1, strategy: SAH } );

	mesh = new THREE.Mesh( knotGeometry, new THREE.MeshStandardMaterial() );
	scene.add( mesh );

	clock = new THREE.Clock();

	const rtMaterial = new THREE.ShaderMaterial( {

		defines: {

			SMOOTH_NORMALS: 1,

		},

		uniforms: {
			bvh: { value: new MeshBVHUniformStruct() },
			normalAttribute: { value: new FloatVertexAttributeTexture() },
			cameraWorldMatrix: { value: new THREE.Matrix4() },
			invProjectionMatrix: { value: new THREE.Matrix4() },
			invModelMatrix: { value: new THREE.Matrix4() },
		},

		vertexShader: /* glsl */`

			varying vec2 vUv;
			void main() {

				vec4 mvPosition = vec4( position, 1.0 );
				mvPosition = modelViewMatrix * mvPosition;
				gl_Position = projectionMatrix * mvPosition;

				vUv = uv;

			}

		`,

		fragmentShader: /* glsl */`
			precision highp usampler2D;
			${ shaderStructs }
			${ shaderIntersectFunction }

			uniform mat4 cameraWorldMatrix;
			uniform mat4 invProjectionMatrix;
			uniform mat4 invModelMatrix;
			uniform sampler2D normalAttribute;
			uniform BVH bvh;
			varying vec2 vUv;

			void main() {

				// get [-1, 1] normalized device coordinates
				vec2 ndc = 2.0 * vUv - vec2( 1.0 );
				Ray ray = ndcToCameraRay( ndc, invModelMatrix * cameraWorldMatrix, invProjectionMatrix );

				// get intersection
				BVHRayHit hit;
				bool didHit = bvhIntersectFirstHit( bvh, ray, hit );

				#if SMOOTH_NORMALS

					vec3 normal = textureSampleBarycoord(
						normalAttribute,
						hit.barycoord,
						hit.face.a,
						hit.face.b,
						hit.face.c
					).xyz;

				#else

					vec3 normal = hit.face.normal;

				#endif

				// set the color
				gl_FragColor = ! didHit ? vec4( 0.0366, 0.0813, 0.1057, 1.0 ) : vec4( normal, 1.0 );

			}
		`

	} );

	rtQuad = new FullScreenQuad( rtMaterial );
	rtMaterial.uniforms.bvh.value.updateFrom( bvh );
	rtMaterial.uniforms.normalAttribute.value.updateFrom( knotGeometry.attributes.normal );

	new OrbitControls( camera, renderer.domElement );

	gui = new GUI();
	gui.add( params, 'enableRaytracing' );
	gui.add( params, 'animate' );
	gui.add( params, 'smoothNormals' ).onChange( v => {

		rtQuad.material.defines.SMOOTH_NORMALS = Number( v );
		rtQuad.material.needsUpdate = true;

	} );
	gui.add( params, 'resolutionScale', 1, 5, 1 ).onChange( resize );
	gui.open();

	window.addEventListener( 'resize', resize, false );
	resize();

}

function resize() {

	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();

	const w = window.innerWidth;
	const h = window.innerHeight;
	const dpr = window.devicePixelRatio * Math.pow( 2, - ( params.resolutionScale - 1 ) );
	renderer.setSize( w, h );
	renderer.setPixelRatio( dpr );

}

function render() {

	stats.update();
	requestAnimationFrame( render );

	const delta = clock.getDelta();
	if ( params.animate ) {

		mesh.rotation.y += delta;

	}

	if ( params.enableRaytracing ) {

		camera.updateMatrixWorld();
		mesh.updateMatrixWorld();

		// update material
		const uniforms = rtQuad.material.uniforms;
		uniforms.cameraWorldMatrix.value.copy( camera.matrixWorld );
		uniforms.invProjectionMatrix.value.copy( camera.projectionMatrixInverse );
		uniforms.invModelMatrix.value.copy( mesh.matrixWorld ).invert();

		// render float target
		rtQuad.render( renderer );

	} else {

		renderer.render( scene, camera );

	}

}
