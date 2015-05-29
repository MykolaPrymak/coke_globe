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
    autorotate: true, // Enable globe autorotation,
    max_polar_angle: PI / 6, // Max angle to polar rotation. PI = 180 deg, PI/2 = 90 deg, PI /6 = 30 deg,
    details: 32, // Globe detail level
    rotation_step: 0.0045, // Rotation speed on drag/spining. Lower value - slower rotation.
    drag_theshold: 5, // Min drag distance in px to start drag and not perform click on globe,
    inertia: { // Inertia configuration
      mass: 15, // Lower value - more massive globe
      dumping: { // 1-0 range. Lower value - fastest globe stop
        normal: 0.95, //Normal dumping value
        fast: 0.3, // Dumping value if user click on the globe
      },
      start_theshold: 0.07, // Start inertia threshold. Lower value - much less move to start spinning.
      stop_theshold: 0.004 // On which inertia value the spinning is stopped. (And start auto rotation if enabled.)
    },
    texture_src: 'img/textures/dashboard_device_map_2048.png', // Main globe texture
    region_texture_src: 'img/textures/dashboard_country_map.png', // Texture with active regions. Using non-zero values from red channel.
    regions: {
      'na': {
        id: 1,
        name: 'North America',
        url: 'http://google.com/?q=north%20america',
        overlay: 'img/textures/dashboard_country_map.png'
      },
      'sa': {
        id: 2,
        name: 'South America',
        url: null,
        overlay: 'img/textures/dashboard_country_map.png'
      },
      'af': {
        id: 3,
        name: 'Africa',
        url: null,
        overlay: 'img/textures/dashboard_country_map.png'
      },
      'eu': {
        id: 4,
        name: 'Europe',
        url: null,
        overlay: 'img/textures/dashboard_country_map.png'
      },
      'au': {
        id: 5,
        name: 'Australia and Oceania',
        url: null,
        overlay: 'img/textures/dashboard_country_map.png'
      }
    },
    overlayOpacity: 0.3 // Opacity of the active region texture mixin
  };

  // Tune values for mobile
  if (features.isMobile) {
    _.extend(config, {
      details: 16,
      rotation_step: 0.006,
      texture_src: 'img/textures/dashboard_device_map_1024.png'
    });
    config.inertia.mass= 50;
    config.inertia.dumping.normal = 0.9;
  }

  // Init dumping value
  config.inertia.dumping.value = config.inertia.dumping.normal;

  // Global variable to store the current status
  var status = {
    mouseX: 0, // Mouse movement x.y position related to container center
    mouseY: 0,
    drag: { // Globe drag status
      possible: true, // is possible?
      started: false, // is started?
      active: false, // is active?
      opts: {
        rotation: {x: 0, y: 0, z: 0}
      }, // Drag start options
      successfully: false // Last drag attempt is successfully
    },
    impulse: {x: 0, y: 0, z: 0},
    canvas_pos: null,
    selected_region: null,
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
    /*
    stats = new Stats();
    stats.domElement.style.position = 'absolute';
    stats.domElement.style.top = '0';
    container.appendChild(stats.domElement);
    */


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
    }
    config.inertia.dumping.value = config.inertia.dumping.fast;
    console.info('status.selected_region', status.selected_region)
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
      config.autorotate = (abs(status.impulse.y) >= config.inertia.start_theshold);
    }

    status.drag.active = false;
    status.drag.started = false;
    //status.drag.possible = false;

    // Restore general dumping factor
    config.inertia.dumping.value = config.inertia.dumping.normal;
  }

  function onDocumentClick(evt) {
    if (status.drag.successfully) {
      return;
    }

    var regionId = getRegionIdAt(evt.clientX, evt.clientY);
    if (regionId !== status.selected_region) {
      status.selected_region = regionId;
    }
    var region = getRegionInfo(regionId);
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

  function getRegionIdAt(x, y) {
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
          if (color[0] !== 0) {
            return color[0];
          }
        }
        // Can't get color
    }
    return null;
  }

  function highlightActiveRegion() {
    var regionId = getRegionIdAt(status.mouseX + status.windowHalfX, status.mouseY + status.windowHalfY);
    if (regionId !== status.selected_region) {
      status.selected_region = regionId;

      var globe = group.children[0];
      if (status.selected_region !== null) {

        if (!status.texture_original_img) {
          status.texture_original_img = globe.material.map.image;
        }
        var cnv = document.createElement('canvas');
        cnv.width = status.texture_original_img.width;
        cnv.height = status.texture_original_img.height;

        ctx = cnv.getContext('2d');

        ctx.drawImage(status.texture_original_img, 0, 0, status.texture_original_img.width, status.texture_original_img.height);
        ctx.globalAlpha = config.overlayOpacity;
        ctx.drawImage(color_picker.cnv, 0, 0, color_picker.size.w, color_picker.size.h, 0, 0, status.texture_original_img.width, status.texture_original_img.height);

        // Put it back and request update
        globe.material.map = new THREE.Texture(cnv);

        globe.material.map.needsUpdate = true;
      } else if (status.texture_original_img) {
        globe.material.map = new THREE.Texture(status.texture_original_img);
        globe.material.map.needsUpdate = true;
      }
    }

    container.style.cursor = (regionId !== null) ? 'pointer' : 'auto';
    if (regionId !== null) {
      var region = getRegionInfo(regionId);
      angle_info.textContent = 'Visit the ' + region.name + ' (' + region.url + ')';
    }
  }

  function getRegionInfo(regionId) {
    return _.find(config.regions, function(region) {return region.id === regionId;})
  }

  function showPopup(region) {
    popup.innerHTML = '<span><h1>' + region.name + '</h1><p>Region id: ' + region.id + '</p><p>Region URL: <a href="' + region.url + '" target="_blanck">' + region.url + '</a></p></span>';
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
    highlightActiveRegion();

    render();
    //stats.update();
  }

  function render() {
    renderer.render(scene, camera);
  }

  // Initialization
  if (init()) {
    // If 3D globe initialization successfully the start animation and initialize the color picker
    animate();

    // Initialize the color picker
    initColorPicker();

    popup = document.getElementById('popup');
    popup.addEventListener('click', function() {
      popup.style.display = 'none';
    }, false);
  }
})();
