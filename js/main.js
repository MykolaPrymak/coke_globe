;(function(){
  // Shorthand for Math
  var abs = Math.abs, sin = Math.sin, cos=Math.cos, PI = Math.PI;

  // Feature detection
  var features = (function(){
    var canvas_elem = document.createElement('canvas');
    var canvas_support = !!canvas_elem.getContext('2d');

    return {
      canvas: canvas_support,
      canvastext: canvas_support && (canvas_elem.getContext('2d').fillText instanceof Function),
      webgl: !!window.WebGLRenderingContext,
      isMobile: !!(navigator.userAgent.match(/Android|webOS|iPhone|iPad|iPod|BlackBerry|Windows Phone/i)),
      acceptTouch: !!(('ontouchstart' in window) || window.DocumentTouch && document instanceof DocumentTouch)
    }
  })();

  // Configuration is here ;)
  var config = {
    // Enable globe autorotation,
    autorotate: true,
    // Restore autorotate after globe spinup
    restore_autorotate: true,
    // Max angle to polar rotation. PI = 180 deg, PI/2 = 90 deg, PI /6 = 30 deg,
    max_polar_angle: PI / 6,
    // Globe detail level
    details: 32,
    // Rotation speed on drag/spining. Lower value - slower rotation.
    rotation_step: 0.0045,
    // Min drag distance in px to start drag and not perform click on globe,
    drag_theshold: 5,
    // Inertia configuration
    inertia: {
      // Lower value - more massive globe
      mass: 15,
      // 1-0 range. Lower value - fastest globe stop
      dumping: {
        // Normal dumping value
        normal: 0.95,
        // Dumping value if user click on the globe
        fast: 0.3
      },
      // Start inertia threshold. Lower value - much less move to start spinning.
      start_theshold: 0.07,
      // On which inertia value the spinning is stopped. (And start auto rotation if enabled.)
      stop_theshold: 0.004
    },
    // Main globe texture
    texture_src: 'img/textures/dashboard-device-map-mobile_v2.jpg',
    // Texture with active regions. Using non-zero values from red channel.
    region_texture_src: 'img/textures/dashboard-device-map-black-out_v2.png',
    regions: [
      {
        color: '#ff2122',
        name: 'Corporate',
        url: 'http://google.com/?q=north%20america',
        // Png image with trasparency. Size is not must be equal to texture image.
        overlay: 'img/textures/dashboard-device-map-mobile-corp_v2.png'
      },
      {
        color: '#71dd4d',
        name: 'Latin America',
        url: null,
        overlay: 'img/textures/dashboard-device-map-mobile-la_v2.png'
      },
      {
        color: '#e7f67d',
        name: 'Eurasian and Africa Group',
        url: null,
        overlay: 'img/textures/dashboard-device-map-mobile-eag_v2.png'
      },
      {
        color: '#5d3ddd',
        name: 'Europe',
        url: null,
        overlay: 'img/textures/dashboard-device-map-mobile-eur_v2.png'
      },
      {
        color: '#72a2ef',
        name: 'Asia Pacific Group',
        url: null,
        overlay: 'img/textures/dashboard-device-map-mobile-apg_v2.png'
      }
    ],
    // Opacity of the active region texture mixin
    overlay_opacity: 1
  };

  // Tune values for mobile
  if (features.isMobile) {
    _.extend(config, {
      details: 16,
      rotation_step: 0.006,
      texture_src: 'img/textures/dashboard-device-map-mobile_v2_1k.jpg'
    });
    config.inertia.mass= 50;
    config.inertia.dumping.normal = 0.9;
  }

  // Init dumping value
  config.inertia.dumping.value = config.inertia.dumping.normal;

  // Global variable to store the current status
  var status = {
    // Mouse movement x.y position related to container center
    mouseX: 0,
    mouseY: 0,
    // Globe drag status
    drag: {
      // is possible?
      possible: true,
      // is started?
      started: false,
      // is drag started outside of globe
      started_outside: false,
      // is active?
      active: false,
      // Drag start options
      opts: {
        rotation: {x: 0, y: 0, z: 0}
      },
      // Last drag attempt is successfully
      successfully: false
    },
    impulse: {x: 0, y: 0, z: 0},
    canvas_pos: null,
    selectedRegion: null,
    windowHalfX: window.innerWidth / 2,
    windowHalfY: window.innerHeight / 2,
    texture_original_img: null
  };

  var color_picker = {
    img: null,
    cnv: null,
    ctx: null,
    size: {w: 500, h: 500}
  }

  // Render global variables
  var container, stats, angle_info, popup;
  var camera, scene, renderer;
  var group;

  // 3D engine init
  function init() {
    container = document.getElementById('container');
    scene = new THREE.Scene();
    group = new THREE.Group();

    scene.add(group);

    angle_info = document.createElement('div');
    angle_info.style.position = 'absolute';
    angle_info.style.left = '100px';
    angle_info.style.top = '0';
    container.appendChild(angle_info);

    try {
     if (features.webgl) {
        renderer = new THREE.WebGLRenderer({
          antialias: !features.isMobile
        });
        angle_info.textContent = 'Using WegGL.';
      }
    } catch(e) {
      console.error('Fail to create WebGl render');
    }

    if (!renderer && features.canvas) {
      renderer = new THREE.CanvasRenderer();
      angle_info.textContent = 'Using Canvas.'
    } else if (!renderer) {
      angle_info.textContent = 'No supported render found';
      return false;
    }
    angle_info.textContent += (features.isMobile ? ' On mobile' : ' On desktop');

    THREE.ImageUtils.crossOrigin = "";
    renderer.setClearColor(0xFFFCFB, 1);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);

    // Camera
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 10000 );
    camera.position.z = (camera.aspect < 1) ? 600 : 500;
    camera.lookAt(scene.position);

    // Earth
    var geometry = new THREE.SphereGeometry(200, config.details, config.details);
    var material = new THREE.MeshBasicMaterial({
      map: THREE.ImageUtils.loadTexture(config.texture_src),
      overdraw: 0.5
    });
    var earthMesh  = new THREE.Mesh(geometry, material);

    group.add(earthMesh);

    container.appendChild(renderer.domElement);

    // Stats
    stats = new Stats();
    stats.domElement.style.position = 'absolute';
    stats.domElement.style.top = '0';
    container.appendChild(stats.domElement);


    // Add event listeners
    window.addEventListener('resize', onWindowResize, false);

    if (!features.acceptTouch) {
      renderer.domElement.addEventListener('mousedown', onDocumentMouseDown, false);
      renderer.domElement.addEventListener('mousemove', onDocumentMouseMove, false);
      renderer.domElement.addEventListener('mouseup', onDocumentMouseUp, false);
      renderer.domElement.addEventListener('mouseleave', onDocumentMouseUp, false);
    } else {
      window.addEventListener('touchstart', onDocumentMouseDown, false);
      window.addEventListener('touchmove', onDocumentMouseMove, false);
      window.addEventListener('touchend', onDocumentMouseUp, false);

      angle_info.textContent += ' Accept touches.';
    }
    renderer.domElement.addEventListener('click', onDocumentClick, false);

    // Get canvas position/size for use in detection func. Not supported by all~!!!!!!!!!!!!!
    status.canvas_pos = renderer.domElement.getBoundingClientRect();
    return true;
  }

  function onWindowResize() {
    status.windowHalfX = window.innerWidth / 2;
    status.windowHalfY = window.innerHeight / 2;

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.position.z = (camera.aspect < 1) ? 600 : 500;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);

    status.canvas_pos = renderer.domElement.getBoundingClientRect();
  }

  function onDocumentMouseDown(evt) {
    if (status.drag.possible) {
      status.drag.started = true;
      status.drag.successfully = false;
      //evt.preventDefault();

      mixTouchToEvent(evt);

      status.drag.opts = {
        x: evt.clientX - status.windowHalfX,
        y: evt.clientY - status.windowHalfY,
        rotation: {x: group.rotation.x, y: group.rotation.y, z: group.rotation.z},
        time: (new Date()).getTime()
      }

      // If this is mobile and we start drag outside the globe (maybe we start a spinup globe rotation - don't highlight regions)
      if (features.isMobile && (getRegionColorAt(status.mouseX + status.windowHalfX, status.mouseY + status.windowHalfY) === null)) {
        status.drag.started_outside = true;
      }
    }
    config.inertia.dumping.value = config.inertia.dumping.fast;
    config.autorotate = false;
  }

  function onDocumentMouseMove(evt) {
    evt.preventDefault();

    mixTouchToEvent(evt);
    status.mouseX = (evt.clientX - status.windowHalfX);
    status.mouseY = (evt.clientY - status.windowHalfY);

    status.drag.possible = true;

    if (status.drag.started && (
        (abs(status.mouseX - status.drag.opts.x) >= config.drag_theshold) ||
        (abs(status.mouseY - status.drag.opts.y) >= config.drag_theshold)
    )) {
      status.drag.active = true;
      status.drag.successfully = true;
    }
  }

  function onDocumentMouseUp(evt) {
    var dragTime = (new Date()).getTime() - status.drag.opts.time;

    if (status.drag.active) {
      _.each(status.drag.opts.rotation, function(angle, axis) {
        var impulse = ((group.rotation[axis] - angle) / dragTime) * config.inertia.mass;

        status.impulse[axis] += abs(impulse) >= config.inertia.start_theshold ? impulse : 0;
      });

      // Not allow spinning with x and z axis
      status.impulse.x = 0;
      status.impulse.z = 0;

      // Reset drag options
      _.extend(status.drag.opts, {x: 0, y: 0, rotation: {x: 0, y: 0, z: 0}});

      // Enable auto-rotation only if we have spinning globe
      config.autorotate = config.restore_autorotate && (abs(status.impulse.y) >= config.inertia.start_theshold);
    }

    status.drag.active = false;
    status.drag.started = false;
    status.drag.started_outside = false;
    //status.drag.possible = false;

    // Restore general dumping factor
    config.inertia.dumping.value = config.inertia.dumping.normal;
  }

  function onDocumentClick(evt) {
    if (status.drag.successfully) {
      return;
    }

    var regionColor = getRegionColorAt(evt.clientX, evt.clientY);
    if (regionColor !== status.selectedRegion) {
      status.selectedRegion = regionColor;
    }
    var region = getRegionInfo(regionColor);
    if (region) {
      showPopup(region);
    }
  }

  function mixTouchToEvent(evt) {
    if (features.acceptTouch &&  evt.touches && (evt.touches.length > 0)) {
      var touch = evt.touches[0];
      evt.clientX = touch.clientX;
      evt.clientY = touch.clientY;
    }
  }

  function initColorPicker() {
    color_picker.img = new Image();
    color_picker.img.onload = function() {
      color_picker.cnv = document.createElement('canvas');
      color_picker.cnv.width = color_picker.size.w;
      color_picker.cnv.height = color_picker.size.h;

      color_picker.ctx = color_picker.cnv.getContext('2d');
      color_picker.ctx.drawImage(color_picker.img, 0, 0, color_picker.size.w, color_picker.size.h);
    };
    color_picker.img.src = config.region_texture_src;
  }

  function getColorAt(pos) {
    if (color_picker.ctx) {
      var pixel = color_picker.ctx.getImageData(color_picker.size.w * pos.x, color_picker.size.h * pos.y, 1, 1);

      // return rgba data as array
      return pixel.data;
    }
    return null;
  }

  function rgbToHex(r, g, b) {
      return "#" + _.map([r, g, b], function(val) {
        var hex = val.toString(16);
        return hex.length == 1 ? "0" + hex : hex;
      }).join('');
  }

  function getRegionColorAt(x, y) {
    var raycaster = new THREE.Raycaster();

    raycaster.ray.origin.set(0, 0, 0);
    camera.localToWorld(raycaster.ray.origin);

    raycaster.ray.direction.set(
        ((x - status.canvas_pos.left) / status.canvas_pos.width) * 2 - 1,
        ((status.canvas_pos.top - y) / status.canvas_pos.height) * 2 + 1,
    0.5).unproject(camera).sub(raycaster.ray.origin).normalize();

    var intersects = raycaster.intersectObject(scene, true);
    if (intersects && intersects[0]) {
        var intersection = intersects[0];
        var point = intersection.point;
        intersection.object.worldToLocal(point);

        var face = intersection.face;
        var faceIndex = intersection.faceIndex;
        var geometry = intersection.object.geometry;

        // http://stackoverflow.com/questions/24662720/retrieving-texture-map-coordinates-from-object-face-three-js#comment38235026_24662720
        var barry = new THREE.Vector3();
        THREE.Triangle.barycoordFromPoint (point,
            geometry.vertices[face.a],
            geometry.vertices[face.b],
            geometry.vertices[face.c],
            barry
        );

        var uv = new THREE.Vector2();
        uv.x += barry.x * geometry.faceVertexUvs[0][faceIndex][0].x;
        uv.y += barry.x * geometry.faceVertexUvs[0][faceIndex][0].y;
        uv.x += barry.y * geometry.faceVertexUvs[0][faceIndex][1].x;
        uv.y += barry.y * geometry.faceVertexUvs[0][faceIndex][1].y;
        uv.x += barry.z * geometry.faceVertexUvs[0][faceIndex][2].x;
        uv.y += barry.z * geometry.faceVertexUvs[0][faceIndex][2].y;

        // Normalize
        uv.y = 1 - uv.y;

        var color = getColorAt(uv);
        if (color !== null) {
          return rgbToHex(color[0], color[1], color[2]);
        }
        // Can't get color
    }
    return null;
  }

  function highlightActiveRegion() {
    var regionColor = getRegionColorAt(status.mouseX + status.windowHalfX, status.mouseY + status.windowHalfY);
    var region = getRegionInfo(regionColor);

    if (regionColor !== status.selectedRegion) {
      status.selectedRegion = regionColor;

      var globe = group.children[0];
      if (region && region.overlay) {
        if (!status.texture_original_img) {
          status.texture_original_img = globe.material.map.image;
        }
        if (!region.overlayCache) {
          var overlay = new Image();
          overlay.onload = function() {
            console.info('image loaded')
            if (regionColor !== status.selectedRegion) {
              // Current region is changed and we cannot apply overlay
              return;
            }
            // Cache region image overlay
            region.overlayCache = applyImageOverlay(globe, overlay);
          }
          overlay.src = region.overlay;
        } else {
          globe.material.map = new THREE.Texture(region.overlayCache);
          globe.material.map.needsUpdate = true;
        }
      } else if (status.texture_original_img) {
        globe.material.map = new THREE.Texture(status.texture_original_img);
        globe.material.map.needsUpdate = true;
      }

      container.style.cursor = region ? 'pointer' : 'auto';

      if (region) {
        angle_info.textContent = 'Visit the ' + region.name + ' (' + region.url + ')';
      }
    }
    angle_info.textContent = 'regionColor ' + regionColor;
  }

  function applyImageOverlay(globe, overlay) {
      var cnv = document.createElement('canvas');
      cnv.width = status.texture_original_img.width;
      cnv.height = status.texture_original_img.height;

      ctx = cnv.getContext('2d');

      // Draw original image
      ctx.drawImage(status.texture_original_img, 0, 0, status.texture_original_img.width, status.texture_original_img.height);

      // Mix with overlay
      ctx.globalAlpha = config.overlay_opacity;
      ctx.drawImage(overlay, 0, 0, overlay.width, overlay.height, 0, 0, status.texture_original_img.width, status.texture_original_img.height);

      // Put it back and request update
      globe.material.map = new THREE.Texture(cnv);

      globe.material.map.needsUpdate = true;

      return cnv;
  }

  function getRegionInfo(regionColor) {
    return _.find(config.regions, function(region) {return region.color === regionColor;});
  }

  function showPopup(region) {
    popup.innerHTML = '<span><h1>' + region.name + '</h1><p>Region color: ' + region.color + '</p><p>Region URL: <a href="' + region.url + '" target="_blanck">' + region.url + '</a></p></span>';
    popup.style.display = 'block';
  }

  function rotateGlobe() {
    if (!status.drag.active) {
      // Globe spinning
      _.each(status.impulse, function(impulse, axis) {
        if (impulse !== 0) {
          if (abs(impulse) > config.inertia.stop_theshold) {
            group.rotation[axis] += impulse;
            status.impulse[axis] *= config.inertia.dumping.value;
          } else {
            status.impulse[axis] = 0;
          }
        }
      });

      if (config.autorotate) {
        group.rotation.y += config.rotation_step / 2;
      }
    } else {
      var xShift = ((status.mouseY - status.drag.opts.y) * (config.rotation_step / 2));
      var yShift = ((status.mouseX - status.drag.opts.x) * (config.rotation_step / 2));
      var xAngle = status.drag.opts.rotation.x;
      var yAngle = status.drag.opts.rotation.y;
      var zAngle = status.drag.opts.rotation.z;

      group.rotation.x = xAngle + xShift; // Polar
      group.rotation.y = yAngle + (cos(xAngle) * yShift); // Equatorial
      //group.rotation.z = zAngle - (sin(xAngle) * yShift); // Azimutal

      // Max polar rotation
      if (group.rotation.x > config.max_polar_angle) {
        group.rotation.x = config.max_polar_angle;
      } else if (group.rotation.x < -config.max_polar_angle) {
        group.rotation.x = -config.max_polar_angle;
      }
    }
  }

  function animate() {
    requestAnimationFrame(animate);

    rotateGlobe();

    // Highlight country under the cursor
    if (!status.drag.started_outside) {
      // Skip if start spinup rotation on mobile.
      highlightActiveRegion();
    }

    render();
    stats.update();
  }

  function precacheOverlays() {
    _.each(config.regions, function(region) {
      var img = new Image();
      img.src = region.overlay;
    });
  }

  function render() {
    renderer.render(scene, camera);
  }

  // Initialization
  popup = document.getElementById('popup');
  if (init()) {
    // If 3D globe initialization successfully the start animation and initialize the color picker
    animate();

    // Initialize the color picker
    initColorPicker();

    popup.addEventListener('click', function() {
      popup.style.display = 'none';
    }, false);

    precacheOverlays();
  } else {
    popup.innerHTML = '<span><h1>Your browser is too old.</h1><p>Update your browser to continue using this page.</p></span>';
    popup.style.display = 'block';
  }
})();
