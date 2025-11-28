import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';

const CVBootDesigner = () => {
  const [params, setParams] = useState({
    bootLength: 120,
    shaftD: 10,
    cupD: 95,
    stretchSmall: 0.95,
    stretchBig: 0.99,
    wallThickness: 3.5,
    ribAmp: 7,
    nRibs: 8,
    shoulderHeight: 2,
    shoulderWidth: 3,
    flatSmallLen: 12,
    flatBigLen: 20
  });

  // NEW: auto-rotate toggle
  const [autoRotate, setAutoRotate] = useState(true);
  const autoRotateRef = useRef(autoRotate);
  useEffect(() => {
    autoRotateRef.current = autoRotate;
  }, [autoRotate]);

  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const meshRef = useRef(null);
  const animationRef = useRef(null);
  const isDraggingRef = useRef(false);
  const previousMousePosition = useRef({ x: 0, y: 0 });
  const cameraAngleRef = useRef({ theta: Math.PI / 4, phi: Math.PI / 4 });
  const cameraDistanceRef = useRef(200);

  const updateParam = (key, value) => {
    setParams(prev => ({ ...prev, [key]: parseFloat(value) }));
  };

  const generateGeometry = (p) => {
    const smallId = p.shaftD * p.stretchSmall;
    const bigId = p.cupD * p.stretchBig;
    const innerSmallR = smallId / 2;
    const innerBigR = bigId / 2;
    const rSmallOuter = innerSmallR + p.wallThickness;
    const rBigOuter = innerBigR + p.wallThickness;

    const NZ = 200;
    const NTheta = 80;
    const LMid = p.bootLength - p.flatSmallLen - p.flatBigLen;

    const vertices = [];
    const outerIdx = [];
    const innerIdx = [];

    for (let i = 0; i < NZ; i++) {
      const z = p.bootLength * i / (NZ - 1); // param along length
      let t = 0;
      if (z <= p.flatSmallLen) {
        t = 0;
      } else if (z >= p.bootLength - p.flatBigLen) {
        t = 1;
      } else {
        t = (z - p.flatSmallLen) / LMid;
      }

      const inSmallFlat = z <= p.flatSmallLen;
      const inBigFlat = z >= p.bootLength - p.flatBigLen;

      let rOut, rIn;

      // Outer radius
      if (inSmallFlat) {
        if (z <= p.shoulderWidth) {
          rOut = rSmallOuter + p.shoulderHeight;
        } else if (p.flatSmallLen - p.shoulderWidth <= z && z <= p.flatSmallLen) {
          rOut = rSmallOuter + p.shoulderHeight;
        } else {
          rOut = rSmallOuter;
        }
      } else if (inBigFlat) {
        if (p.bootLength - p.flatBigLen <= z && z <= p.bootLength - p.flatBigLen + p.shoulderWidth) {
          rOut = rBigOuter + p.shoulderHeight + 1.5;
        } else if (z >= p.bootLength - p.shoulderWidth) {
          rOut = rBigOuter + p.shoulderHeight + 1.5;
        } else {
          rOut = rBigOuter + 1.5;
        }
      } else {
        const coreR = rSmallOuter + (rBigOuter - rSmallOuter) * t;
        const ribPhase = 2 * Math.PI * p.nRibs * t;
        const rOutRaw = coreR + p.ribAmp * Math.sin(ribPhase);
        rOut = Math.max(rOutRaw, innerSmallR + p.wallThickness);
      }

      // Inner radius
      if (inSmallFlat) {
        rIn = innerSmallR;
      } else if (inBigFlat) {
        rIn = innerBigR;
      } else {
        let rInCandidate = rOut - p.wallThickness;
        rIn = Math.min(Math.max(rInCandidate, innerSmallR), innerBigR);
        const firstRibZone = 1 / p.nRibs;
        if (t < firstRibZone) {
          rIn = innerSmallR;
        }
      }

      if (rOut < rIn + p.wallThickness) {
        rOut = rIn + p.wallThickness;
      }

      const outerRow = [];
      const innerRow = [];

      for (let j = 0; j < NTheta; j++) {
        const theta = 2 * Math.PI * j / NTheta;
        const ct = Math.cos(theta);
        const st = Math.sin(theta);

        // NOTE: height along Y, big cup at y=0, shaft up at y=bootLength
        const y = p.bootLength - z;

        outerRow.push(vertices.length / 3);
        vertices.push(rOut * ct, y, rOut * st);

        innerRow.push(vertices.length / 3);
        vertices.push(rIn * ct, y, rIn * st);
      }

      outerIdx.push(outerRow);
      innerIdx.push(innerRow);
    }

    const indices = [];

    // Outer and inner surfaces
    for (let i = 0; i < NZ - 1; i++) {
      for (let j = 0; j < NTheta; j++) {
        const jNext = (j + 1) % NTheta;

        const v00 = outerIdx[i][j];
        const v01 = outerIdx[i][jNext];
        const v10 = outerIdx[i + 1][j];
        const v11 = outerIdx[i + 1][jNext];
        indices.push(v00, v10, v11, v00, v11, v01);

        const v00i = innerIdx[i][j];
        const v01i = innerIdx[i][jNext];
        const v10i = innerIdx[i + 1][j];
        const v11i = innerIdx[i + 1][jNext];
        indices.push(v00i, v11i, v10i, v00i, v01i, v11i);
      }
    }

    // End caps
    for (let j = 0; j < NTheta; j++) {
      const jNext = (j + 1) % NTheta;

      const vo0 = outerIdx[0][j];
      const vo1 = outerIdx[0][jNext];
      const vi0 = innerIdx[0][j];
      const vi1 = innerIdx[0][jNext];
      indices.push(vo0, vi1, vi0, vo0, vo1, vi1);

      const vo0b = outerIdx[NZ - 1][j];
      const vo1b = outerIdx[NZ - 1][jNext];
      const vi0b = innerIdx[NZ - 1][j];
      const vi1b = innerIdx[NZ - 1][jNext];
      indices.push(vo0b, vi0b, vi1b, vo0b, vi1b, vo1b);
    }

    return { vertices: new Float32Array(vertices), indices: new Uint32Array(indices) };
  };

  const downloadSTL = () => {
    const { vertices, indices } = generateGeometry(params);
    
    let stl = 'solid cv_boot\n';
    
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i] * 3;
      const b = indices[i + 1] * 3;
      const c = indices[i + 2] * 3;
      
      const ax = vertices[a], ay = vertices[a + 1], az = vertices[a + 2];
      const bx = vertices[b], by = vertices[b + 1], bz = vertices[b + 2];
      const cx = vertices[c], cy = vertices[c + 1], cz = vertices[c + 2];
      
      const ux = bx - ax, uy = by - ay, uz = bz - az;
      const vx = cx - ax, vy = cy - ay, vz = cz - az;
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      
      stl += `  facet normal ${(nx/len).toExponential(6)} ${(ny/len).toExponential(6)} ${(nz/len).toExponential(6)}\n`;
      stl += '    outer loop\n';
      stl += `      vertex ${ax.toExponential(6)} ${ay.toExponential(6)} ${az.toExponential(6)}\n`;
      stl += `      vertex ${bx.toExponential(6)} ${by.toExponential(6)} ${bz.toExponential(6)}\n`;
      stl += `      vertex ${cx.toExponential(6)} ${cy.toExponential(6)} ${cz.toExponential(6)}\n`;
      stl += '    endloop\n';
      stl += '  endfacet\n';
    }
    
    stl += 'endsolid cv_boot\n';
    
    const blob = new Blob([stl], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cv_boot.stl';
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (!mountRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0a);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      45,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.1,
      2000
    );
    camera.position.set(150, 100, 150);
    camera.lookAt(0, params.bootLength / 2, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight1.position.set(100, 100, 100);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x4488ff, 0.4);
    dirLight2.position.set(-100, -50, -100);
    scene.add(dirLight2);

    // Grid on ground (XZ plane), big cup sits on y=0
    const gridHelper = new THREE.GridHelper(200, 20, 0x333333, 0x1a1a1a);
    scene.add(gridHelper);

    // Update camera position based on spherical coordinates
    const updateCameraPosition = () => {
      const theta = cameraAngleRef.current.theta;
      const phi = cameraAngleRef.current.phi;
      const distance = cameraDistanceRef.current;
      const target = new THREE.Vector3(0, params.bootLength / 2, 0);

      camera.position.x = target.x + distance * Math.sin(phi) * Math.cos(theta);
      camera.position.y = target.y + distance * Math.cos(phi);
      camera.position.z = target.z + distance * Math.sin(phi) * Math.sin(theta);
      camera.lookAt(target);
    };

    // Manual mouse controls - Fusion 360 style
    const handleMouseDown = (e) => {
      isDraggingRef.current = true;
      previousMousePosition.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseMove = (e) => {
      if (!isDraggingRef.current) return;

      const deltaX = e.clientX - previousMousePosition.current.x;
      const deltaY = e.clientY - previousMousePosition.current.y;

      // Update spherical coordinates
      cameraAngleRef.current.theta -= deltaX * 0.01;
      cameraAngleRef.current.phi -= deltaY * 0.01;

      // Clamp phi to avoid flipping
      cameraAngleRef.current.phi = Math.max(0.1, Math.min(Math.PI - 0.1, cameraAngleRef.current.phi));

      updateCameraPosition();

      previousMousePosition.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
    };

    const handleWheel = (e) => {
      e.preventDefault();
      const delta = e.deltaY * 0.5;
      cameraDistanceRef.current += delta;
      cameraDistanceRef.current = Math.max(50, Math.min(cameraDistanceRef.current, 500));
      updateCameraPosition();
    };

    renderer.domElement.addEventListener('mousedown', handleMouseDown);
    renderer.domElement.addEventListener('mousemove', handleMouseMove);
    renderer.domElement.addEventListener('mouseup', handleMouseUp);
    renderer.domElement.addEventListener('mouseleave', handleMouseUp);
    renderer.domElement.addEventListener('wheel', handleWheel, { passive: false });

    const animate = () => {
      if (meshRef.current && autoRotateRef.current && !isDraggingRef.current) {
        meshRef.current.rotation.y += 0.005;
      }
      renderer.render(scene, camera);
      animationRef.current = requestAnimationFrame(animate);
    };
    animate();

    const handleResize = () => {
      if (!mountRef.current) return;
      camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (rendererRef.current) {
        renderer.domElement.removeEventListener('mousedown', handleMouseDown);
        renderer.domElement.removeEventListener('mousemove', handleMouseMove);
        renderer.domElement.removeEventListener('mouseup', handleMouseUp);
        renderer.domElement.removeEventListener('mouseleave', handleMouseUp);
        renderer.domElement.removeEventListener('wheel', handleWheel);
      }
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (rendererRef.current) {
        mountRef.current?.removeChild(rendererRef.current.domElement);
        rendererRef.current.dispose();
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!sceneRef.current) return;

    if (meshRef.current) {
      sceneRef.current.remove(meshRef.current);
      meshRef.current.geometry.dispose();
      meshRef.current.material.dispose();
    }

    const { vertices, indices } = generateGeometry(params);
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      color: 0x00d4ff,
      metalness: 0.4,
      roughness: 0.3,
      side: THREE.DoubleSide
    });

    const mesh = new THREE.Mesh(geometry, material);
    // No extra Y offset; big cup is already at y=0
    sceneRef.current.add(mesh);
    meshRef.current = mesh;
  }, [params]);

  return (
    <div className="flex h-screen bg-zinc-950 text-white">
      <div className="w-96 bg-zinc-900 p-6 overflow-y-auto border-r border-zinc-800">
        <h1 className="text-2xl font-bold mb-6 bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
          CV Boot Designer
        </h1>

        {/* Auto-rotate toggle */}
        <div className="mb-4 flex items-center gap-2">
          <input
            id="auto-rotate"
            type="checkbox"
            checked={autoRotate}
            onChange={(e) => setAutoRotate(e.target.checked)}
            className="h-4 w-4 accent-cyan-500"
          />
          <label htmlFor="auto-rotate" className="text-sm text-zinc-300">
            Auto-rotate preview
          </label>
        </div>

        <div className="space-y-6">
          <div className="bg-zinc-800/50 p-4 rounded-lg border border-zinc-700">
            <h2 className="text-sm font-semibold text-cyan-400 mb-3">DIMENSIONS</h2>
            
            <div className="space-y-3">
              <div>
                <label className="text-xs text-zinc-400">Boot Length (mm)</label>
                <input
                  type="range"
                  min="80"
                  max="200"
                  step="1"
                  value={params.bootLength}
                  onChange={(e) => updateParam('bootLength', e.target.value)}
                  className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
                <div className="text-right text-sm font-mono text-cyan-400">{params.bootLength}</div>
              </div>

              <div>
                <label className="text-xs text-zinc-400">Shaft Diameter (mm)</label>
                <input
                  type="range"
                  min="5"
                  max="30"
                  step="0.5"
                  value={params.shaftD}
                  onChange={(e) => updateParam('shaftD', e.target.value)}
                  className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
                <div className="text-right text-sm font-mono text-cyan-400">{params.shaftD}</div>
              </div>

              <div>
                <label className="text-xs text-zinc-400">Cup Diameter (mm)</label>
                <input
                  type="range"
                  min="50"
                  max="150"
                  step="1"
                  value={params.cupD}
                  onChange={(e) => updateParam('cupD', e.target.value)}
                  className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
                <div className="text-right text-sm font-mono text-cyan-400">{params.cupD}</div>
              </div>
            </div>
          </div>

          <div className="bg-zinc-800/50 p-4 rounded-lg border border-zinc-700">
            <h2 className="text-sm font-semibold text-cyan-400 mb-3">STRETCH & WALL</h2>
            
            <div className="space-y-3">
              <div>
                <label className="text-xs text-zinc-400">Small End Stretch</label>
                <input
                  type="range"
                  min="0.85"
                  max="1.0"
                  step="0.01"
                  value={params.stretchSmall}
                  onChange={(e) => updateParam('stretchSmall', e.target.value)}
                  className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
                <div className="text-right text-sm font-mono text-cyan-400">{params.stretchSmall.toFixed(2)}</div>
              </div>

              <div>
                <label className="text-xs text-zinc-400">Big End Stretch</label>
                <input
                  type="range"
                  min="0.85"
                  max="1.0"
                  step="0.01"
                  value={params.stretchBig}
                  onChange={(e) => updateParam('stretchBig', e.target.value)}
                  className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
                <div className="text-right text-sm font-mono text-cyan-400">{params.stretchBig.toFixed(2)}</div>
              </div>

              <div>
                <label className="text-xs text-zinc-400">Wall Thickness (mm)</label>
                <input
                  type="range"
                  min="1"
                  max="8"
                  step="0.1"
                  value={params.wallThickness}
                  onChange={(e) => updateParam('wallThickness', e.target.value)}
                  className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
                <div className="text-right text-sm font-mono text-cyan-400">{params.wallThickness.toFixed(1)}</div>
              </div>
            </div>
          </div>

          <div className="bg-zinc-800/50 p-4 rounded-lg border border-zinc-700">
            <h2 className="text-sm font-semibold text-cyan-400 mb-3">RIBS</h2>
            
            <div className="space-y-3">
              <div>
                <label className="text-xs text-zinc-400">Rib Amplitude (mm)</label>
                <input
                  type="range"
                  min="0"
                  max="15"
                  step="0.5"
                  value={params.ribAmp}
                  onChange={(e) => updateParam('ribAmp', e.target.value)}
                  className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
                <div className="text-right text-sm font-mono text-cyan-400">{params.ribAmp}</div>
              </div>

              <div>
                <label className="text-xs text-zinc-400">Number of Ribs</label>
                <input
                  type="range"
                  min="1"
                  max="20"
                  step="1"
                  value={params.nRibs}
                  onChange={(e) => updateParam('nRibs', e.target.value)}
                  className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
                <div className="text-right text-sm font-mono text-cyan-400">{params.nRibs}</div>
              </div>
            </div>
          </div>

          <div className="bg-zinc-800/50 p-4 rounded-lg border border-zinc-700">
            <h2 className="text-sm font-semibold text-cyan-400 mb-3">SHOULDERS & CLAMPS</h2>
            
            <div className="space-y-3">
              <div>
                <label className="text-xs text-zinc-400">Shoulder Height (mm)</label>
                <input
                  type="range"
                  min="0"
                  max="5"
                  step="0.1"
                  value={params.shoulderHeight}
                  onChange={(e) => updateParam('shoulderHeight', e.target.value)}
                  className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
                <div className="text-right text-sm font-mono text-cyan-400">{params.shoulderHeight.toFixed(1)}</div>
              </div>

              <div>
                <label className="text-xs text-zinc-400">Shoulder Width (mm)</label>
                <input
                  type="range"
                  min="1"
                  max="8"
                  step="0.5"
                  value={params.shoulderWidth}
                  onChange={(e) => updateParam('shoulderWidth', e.target.value)}
                  className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
                <div className="text-right text-sm font-mono text-cyan-400">{params.shoulderWidth.toFixed(1)}</div>
              </div>

              <div>
                <label className="text-xs text-zinc-400">Small Clamp Length (mm)</label>
                <input
                  type="range"
                  min="5"
                  max="30"
                  step="1"
                  value={params.flatSmallLen}
                  onChange={(e) => updateParam('flatSmallLen', e.target.value)}
                  className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
                <div className="text-right text-sm font-mono text-cyan-400">{params.flatSmallLen}</div>
              </div>

              <div>
                <label className="text-xs text-zinc-400">Big Clamp Length (mm)</label>
                <input
                  type="range"
                  min="10"
                  max="40"
                  step="1"
                  value={params.flatBigLen}
                  onChange={(e) => updateParam('flatBigLen', e.target.value)}
                  className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
                <div className="text-right text-sm font-mono text-cyan-400">{params.flatBigLen}</div>
              </div>
            </div>
          </div>

          <button
            onClick={downloadSTL}
            className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200 shadow-lg hover:shadow-cyan-500/50"
          >
            Download STL
          </button>
        </div>
      </div>

      <div className="flex-1 relative">
        <div ref={mountRef} className="w-full h-full" />
        <div className="absolute top-4 right-4 bg-zinc-900/90 backdrop-blur-sm px-4 py-2 rounded-lg border border-zinc-700">
          <div className="text-xs text-zinc-400">
            {autoRotate ? 'Auto-rotate ON' : 'Auto-rotate OFF'} • Drag to rotate • Scroll to zoom
          </div>
        </div>
      </div>
    </div>
  );
};

export default CVBootDesigner;