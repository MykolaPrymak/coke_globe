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
    region_texture_src: 'img/textures/dashboard_country_map.png' // Texture with active regions. Using non-zero values from red channel.
  };

  // Tune values for mobile
  if (features.isMobile) {
    config.details = 16;
    config.rotation_step = 0.006;

    config.inertia.mass = 50;
    config.inertia.dumping.normal = 0.9;
    config.texture_src = 'img/textures/dashboard_device_map_1024.png';

  }

  // Init dumping value
  config.inertia.dumping.value = config.inertia.dumping.normal;

  // Global variable to store the current status
  var status = {
    mouseX: 0, // Mouse movement x.y position related to container center
    mouseY: 0,
    drag: { // Globe drag status
      possible: true, // is possible?
      active: false, // is active?
      opts: {}, // Drag start options
      successfully: false // Last drag attempt is successfully
    },
    impulse: {x: 0, y: 0, z: 0},
    canvas_pos: null,
    selected_country: null,
    windowHalfX: window.innerWidth / 2,
    windowHalfY: window.innerHeight / 2
  };

  // Render global variables
  var container, stats, angle_info;
  var camera, scene, renderer;
  var group;



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

    if (features.webgl) {
      renderer = new THREE.WebGLRenderer({
        antialias: !features.isMobile
      });
      angle_info.textContent = 'Using WegGL.';
    } else if (features.canvas) {
      renderer = new THREE.CanvasRenderer();
      angle_info.textContent = 'Using Canvas.'
    } else {
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
      status.drag.successfully = false;
      //evt.preventDefault();

      mixTouchToEvent(evt);
      //angle_info.textContent = 'Touch start';
      status.drag.opts = {
        x: evt.clientX - status.windowHalfX,
        y: evt.clientY - status.windowHalfY,
        rotation: {x: group.rotation.x, y: group.rotation.y, z: group.rotation.z},
        time: (new Date()).getTime()
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

    //checkIntersection(evt);
    status.drag.possible = true;

    if (status.drag.opts && ((abs(status.mouseX - status.drag.opts.x) >= config.drag_theshold) || (abs(status.mouseY - status.drag.opts.y) >= config.drag_theshold))) {
      status.drag.active = true;
      status.drag.successfully = true;
    }
  }

  function onDocumentMouseUp(evt) {
    //angle_info.textContent += ' -> Touch end';
    var dragTime = (new Date()).getTime() - status.drag.opts.time;

    var impulse = {
      x: ((group.rotation.x - status.drag.opts.rotation.x) / dragTime) * config.inertia.mass,
      y: ((group.rotation.y - status.drag.opts.rotation.y) / dragTime) * config.inertia.mass,
      z: ((group.rotation.z - status.drag.opts.rotation.z) / dragTime) * config.inertia.mass
    }

    status.impulse.x += abs(impulse.x) >= config.inertia.start_theshold ? impulse.x : 0;
    status.impulse.y += abs(impulse.y) >= config.inertia.start_theshold ? impulse.y : 0;
    status.impulse.z += abs(impulse.z) >= config.inertia.start_theshold ? impulse.z : 0;

    status.drag.active = false;
    status.drag.opts = {};

    // Enable auto-rotation only if we have spinning globe
    config.autorotate = (abs(status.impulse.y) >= config.inertia.start_theshold);

    //checkIntersection(evt);
    //status.drag.possible = false;

    config.inertia.dumping.value = config.inertia.dumping.normal;
  }

  function onDocumentClick(evt) {
    if (status.drag.successfully) {
      return;
    }

    var country_code = getCountryCode(evt.clientX, evt.clientY);
    if (country_code !== status.selected_country) {
      status.selected_country = country_code;
    }
    angle_info.textContent = 'Click on ' + (country_code ? ('country ' + country_code) : 'ocean');
  }

  function mixTouchToEvent(evt) {
    if (features.acceptTouch &&  evt.touches && (evt.touches.length > 0)) {
      var touch = evt.touches[0];
      evt.clientX = touch.clientX;
      evt.clientY = touch.clientY;
    }
  }

  function getCountryCode(mouseX, mouseY) {
    var raycaster = new THREE.Raycaster();

    raycaster.ray.origin.set(0, 0, 0);
    camera.localToWorld(raycaster.ray.origin);

    raycaster.ray.direction.set(
        ((mouseX - status.canvas_pos.left) / status.canvas_pos.width) * 2 - 1,
        ((status.canvas_pos.top - mouseY) / status.canvas_pos.height) * 2 + 1,
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

        // uv coordinates are straightforward to convert into lat/lon
        //var lat = 180 * (uv.y - 0.5);
        //var lon = 360 * (uv.x - 0.5);

        // Normalize
        uv.y = 1 - uv.y;

        var color = getColorAt(uv);
        if (color !== null) {
          if (color[0] !== 0) {
            //angle_info.textContent = 'Country code: ' + color[0];
            container.style.cursor = 'pointer';
            return color[0];
          } else {
            //angle_info.textContent = 'Empty space';
            container.style.cursor = 'auto';
          }
        } else {
          angle_info.textContent = 'Can\'t get color';
        }
    } else {
      container.style.cursor = 'auto';
    }
    return null
  }

  var color_picker_canvas;
  var color_picker_canvas_ctx;
  var color_picker_canvas_size = {w: 500, h: 500};

  function init_color_picker() {
    var img = new Image();
    img.onload = function() {
      color_picker_canvas = document.createElement('canvas');
      color_picker_canvas.width = color_picker_canvas_size.w;
      color_picker_canvas.height = color_picker_canvas_size.h;

      color_picker_canvas_ctx = color_picker_canvas.getContext('2d');
      color_picker_canvas_ctx.drawImage(img, 0, 0, color_picker_canvas_size.w, color_picker_canvas_size.h);
    };
    img.src = config.region_texture_src;
  }

  function getColorAt(pos) {
    if (color_picker_canvas_ctx) {
      var pixel = color_picker_canvas_ctx.getImageData(color_picker_canvas_size.w * pos.x, color_picker_canvas_size.h * pos.y, 1, 1);
      //console.info(color_picker_canvas_size.w * pos.x, color_picker_canvas_size.h * pos.y)
      // return rgba data as array
      return pixel.data;
    }
    return null;
  }

  function checkIntersection(evt) {
    if (!status.drag.active) {
      var isHaveIntersection = getIntersection(evt);
      if (isHaveIntersection !== status.drag.possible) {
        container.style.cursor = isHaveIntersection || status.drag.active ? 'pointer' : 'auto';
        status.drag.possible = isHaveIntersection;
      }
    }
  }

  function getIntersection(evt) {
    var raycaster = new THREE.Raycaster();
    var mouse = new THREE.Vector2();

    // Find intersection with globe
    mouse.x = ( evt.clientX / window.innerWidth ) * 2 - 1;
    mouse.y = - ( evt.clientY / window.innerHeight ) * 2 + 1;

    // update the picking ray with the camera and mouse position
    raycaster.setFromCamera(mouse, camera);

    var intersects = raycaster.intersectObjects(group.children);
    if (intersects.length > 0) {
      return intersects[0];
    } else {
      return false;
    }
  }

  var original_image;
  function animate() {
    requestAnimationFrame(animate);

    if (!status.drag.active) {
      /*
      if (status.impulse.x !== 0) {
        if (abs(status.impulse.x) > config.inertia.stop_theshold) {
          group.rotation.x += status.impulse.x;
          status.impulse.x *= config.inertia.dumping.value;
        } else {
          status.impulse.x = 0;
        }
      }
      */
      if (status.impulse.y !== 0) {
        if (abs(status.impulse.y) > config.inertia.stop_theshold) {
          group.rotation.y += status.impulse.y;
          status.impulse.y *= config.inertia.dumping.value;
        } else {
          status.impulse.y = 0;
        }
      }
      /*
      if (status.impulse.z !== 0) {
        if (abs(status.impulse.z) > config.inertia.stop_theshold) {
          group.rotation.z += status.impulse.z;
          status.impulse.z *= config.inertia.dumping.value;
        } else {
          status.impulse.z = 0;
        }
      }
      */
      /*
      group.rotation.y += config.rotation_step;
      camera.position.x += (status.mouseX - camera.position.x) * 0.05;
      camera.position.y += (- status.mouseY - camera.position.y) * 0.05;
      camera.lookAt(scene.position);

      // Reset the x rotation if no free move
      if (group.rotation.x !== 0) {
        var DOUBLE_PI = (PI * 2);
        // Normalize angle
        if (abs(group.rotation.x) > DOUBLE_PI) {
          group.rotation.x = group.rotation.x % DOUBLE_PI;
        }

        // Reset if angle is too small
        if (abs(group.rotation.x) < config.rotation_step) {
          group.rotation.x = 0;
        }
        group.rotation.x += config.rotation_step * (group.rotation.x > 0 ? -1 : 1);
      }
      */
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

    var country_code = getCountryCode(status.mouseX + status.windowHalfX, status.mouseY + status.windowHalfY);
    if (country_code !== status.selected_country) {
      status.selected_country = country_code;

      var globe = group.children[0];
      if (status.selected_country !== null) {
       // Draw random circle
        if (!original_image) {
          original_image = globe.material.map.image;
        }
        var cnv = document.createElement('canvas');
        cnv.width = original_image.width;
        cnv.height = original_image.height;

        ctx = cnv.getContext('2d');

        ctx.drawImage(original_image, 0, 0, original_image.width, original_image.height);
        ctx.globalAlpha = .3;
        //ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(color_picker_canvas, 0, 0, color_picker_canvas.width, color_picker_canvas.height, 0, 0, original_image.width, original_image.height);

        // Put it back and request update
        globe.material.map = new THREE.Texture(cnv);

        globe.material.map.needsUpdate = true;
      } else if (original_image) {
        globe.material.map = new THREE.Texture(original_image);
        globe.material.map.needsUpdate = true;
      }
    }

    render();
    stats.update();
  }

  function render() {
    renderer.render(scene, camera);
  }

  // Initialization
  if (init()) {
    // If 3D globe initialization successfully the start animation and initialize the color picker
    animate();

    // Initialize the color picker
    init_color_picker();
  }
})();
