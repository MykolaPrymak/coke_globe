;(function(){
  // Shorthand for Math
  var abs = Math.abs, sin = Math.sin, cos=Math.cos, PI = Math.PI;

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

  var container, stats, angle_info;
  var camera, scene, renderer;
  var group;
  var mouseX = 0, mouseY = 0;
  var isDragPossible = !false, isOnDragg = false, dragOpts, isGlobeDragged = false;
  var DRAG_THESHOLD = 5;
  var ROTATION_STEP = features.isMobile ? 0.006 : 0.0045;
  var GLOBE_DETAILS = features.isMobile ? 16 : 32;
  var GLOBE_MAX_POLAR_ANGLE = PI / 6;
  var isGlobeAutorotate = true;


  // Globe inertions
  var GLOBE_MASS = (features.isMobile ? 50 : 15);
  var GLOBE_DAMPING_FACTOR = (features.isMobile ? 0.9 : 0.95);
  var GLOBE_FAST_DAMPING_FACTOR = 0.3;
  var GLOBE_INERTION_START_THESHOLD = 0.07;
  var GLOBE_INERTION_STOP_THESHOLD = 0.004;

  var globeImpulse = {x: 0, y: 0, z: 0};
  var globeDampingFactor = GLOBE_DAMPING_FACTOR;

  var windowHalfX = window.innerWidth / 2;
  var windowHalfY = window.innerHeight / 2;

  var texture_src = 'img/textures/dashboard_device_map_' + (features.isMobile ? 1024 : 2048) + '.png';

  // Country selection
  var map_texture_src = 'img/textures/dashboard_country_map.png';
  var canvasRect;
  var selected_country = null;

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
    var geometry = new THREE.SphereGeometry(200, GLOBE_DETAILS, GLOBE_DETAILS);
    var material = new THREE.MeshBasicMaterial({
      map: THREE.ImageUtils.loadTexture(texture_src),
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
    container.appendChild( stats.domElement );
    */


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
    canvasRect = renderer.domElement.getBoundingClientRect();
    return true;
  }

  function onWindowResize() {
    windowHalfX = window.innerWidth / 2;
    windowHalfY = window.innerHeight / 2;

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.position.z = (camera.aspect < 1) ? 600 : 500;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);

    canvasRect = renderer.domElement.getBoundingClientRect();
  }

  function onDocumentMouseDown(evt) {
    if (isDragPossible) {
      isGlobeDragged = false;
      //evt.preventDefault();

      mixTouchToEvent(evt);
      angle_info.textContent = 'Touch start';
      dragOpts = {
        x: evt.clientX - windowHalfX,
        y: evt.clientY - windowHalfY,
        rotation: {x: group.rotation.x, y: group.rotation.y, z: group.rotation.z},
        time: (new Date()).getTime()
      }
    }
    globeDampingFactor = GLOBE_FAST_DAMPING_FACTOR;
    isGlobeAutorotate = false;
  }

  function onDocumentMouseMove(evt) {
    evt.preventDefault();

    mixTouchToEvent(evt);
    mouseX = (evt.clientX - windowHalfX);
    mouseY = (evt.clientY - windowHalfY);

    //checkIntersection(evt);
    isDragPossible = true;

    if (dragOpts && ((abs(mouseX - dragOpts.x) >= DRAG_THESHOLD) || (abs(mouseY - dragOpts.y) >= DRAG_THESHOLD))) {
      isOnDragg = true;
      isGlobeDragged = true;
    }
  }

  function onDocumentMouseUp(evt) {
    angle_info.textContent += ' -> Touch end';
    var dragTime = (new Date()).getTime() - dragOpts.time;

    var impulse = {
      x: ((group.rotation.x - dragOpts.rotation.x) / dragTime) * GLOBE_MASS,
      y: ((group.rotation.y - dragOpts.rotation.y) / dragTime) * GLOBE_MASS,
      z: ((group.rotation.z - dragOpts.rotation.z) / dragTime) * GLOBE_MASS
    }

    globeImpulse.x += abs(impulse.x) >= GLOBE_INERTION_START_THESHOLD ? impulse.x : 0;
    globeImpulse.y += abs(impulse.y) >= GLOBE_INERTION_START_THESHOLD ? impulse.y : 0;
    globeImpulse.z += abs(impulse.z) >= GLOBE_INERTION_START_THESHOLD ? impulse.z : 0;

    isOnDragg = false;
    dragOpts = false;

    // Enable auto-rotation only if we have spinning globe
    isGlobeAutorotate = (abs(globeImpulse.y) >= GLOBE_INERTION_START_THESHOLD);

    //checkIntersection(evt);
    //isDragPossible = false;

    globeDampingFactor = GLOBE_DAMPING_FACTOR;
  }

  function onDocumentClick(evt) {
    if (isGlobeDragged) {
      return;
    }

    var country_code = getCountryCode(evt.clientX, evt.clientY);
    if (country_code !== selected_country) {
      selected_country = country_code;
      angle_info.textContent = 'Click on ' + angle_info.textContent.toLowerCase();
    }
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
        ((mouseX - canvasRect.left) / canvasRect.width) * 2 - 1,
        ((canvasRect.top - mouseY) / canvasRect.height) * 2 + 1,
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
            angle_info.textContent = 'Country code: ' + color[0];
            container.style.cursor = 'pointer';
            return color[0];
          } else {
            angle_info.textContent = 'Empty space';
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
    img.src = map_texture_src;
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
    if (!isOnDragg) {
      var isHaveIntersection = getIntersection(evt);
      if (isHaveIntersection !== isDragPossible) {
        container.style.cursor = isHaveIntersection || isOnDragg ? 'pointer' : 'auto';
        isDragPossible = isHaveIntersection;
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

  function rad2deg(rad) {
    return rad * 180 / PI;
  }

  function rad2deg(rad) {
    return rad * 180 / PI;
  }

var original_image;
  function animate() {
    requestAnimationFrame(animate);

    if (!isOnDragg) {
      /*
      if (globeImpulse.x !== 0) {
        if (abs(globeImpulse.x) > GLOBE_INERTION_STOP_THESHOLD) {
          group.rotation.x += globeImpulse.x;
          globeImpulse.x *= globeDampingFactor;
        } else {
          globeImpulse.x = 0;
        }
      }
      */
      if (globeImpulse.y !== 0) {
        if (abs(globeImpulse.y) > GLOBE_INERTION_STOP_THESHOLD) {
          group.rotation.y += globeImpulse.y;
          globeImpulse.y *= globeDampingFactor;
        } else {
          globeImpulse.y = 0;
        }
      }
      /*
      if (globeImpulse.z !== 0) {
        if (abs(globeImpulse.z) > GLOBE_INERTION_STOP_THESHOLD) {
          group.rotation.z += globeImpulse.z;
          globeImpulse.z *= globeDampingFactor;
        } else {
          globeImpulse.z = 0;
        }
      }
      */
      /*
      group.rotation.y += ROTATION_STEP;
      camera.position.x += (mouseX - camera.position.x) * 0.05;
      camera.position.y += (- mouseY - camera.position.y) * 0.05;
      camera.lookAt(scene.position);

      // Reset the x rotation if no free move
      if (group.rotation.x !== 0) {
        var DOUBLE_PI = (PI * 2);
        // Normalize angle
        if (abs(group.rotation.x) > DOUBLE_PI) {
          group.rotation.x = group.rotation.x % DOUBLE_PI;
        }

        // Reset if angle is too small
        if (abs(group.rotation.x) < ROTATION_STEP) {
          group.rotation.x = 0;
        }
        group.rotation.x += ROTATION_STEP * (group.rotation.x > 0 ? -1 : 1);
      }
      */
      if (isGlobeAutorotate) {
        group.rotation.y += ROTATION_STEP / 2;
      }
    } else {
      var xShift = ((mouseY - dragOpts.y) * (ROTATION_STEP / 2));
      var yShift = ((mouseX - dragOpts.x) * (ROTATION_STEP / 2));
      var xAngle = dragOpts.rotation.x;
      var yAngle = dragOpts.rotation.y;
      var zAngle = dragOpts.rotation.z;

      group.rotation.x = xAngle + xShift; // Polar
      group.rotation.y = yAngle + (cos(xAngle) * yShift); // Equatorial
      //group.rotation.z = zAngle - (sin(xAngle) * yShift); // Azimutal

      // Max polar rotation
      if (group.rotation.x > GLOBE_MAX_POLAR_ANGLE) {
        group.rotation.x = GLOBE_MAX_POLAR_ANGLE;
      } else if (group.rotation.x < -GLOBE_MAX_POLAR_ANGLE) {
        group.rotation.x = -GLOBE_MAX_POLAR_ANGLE;
      }
    }

    var country_code = getCountryCode(mouseX + windowHalfX, mouseY + windowHalfY);
    if (country_code !== selected_country) {
      selected_country = country_code;

      var globe = group.children[0];
      if (selected_country !== null) {
       // Draw random circle
        if (!original_image) {
          original_image = globe.material.map.image;
        }
        var cnv = document.createElement('canvas');
        cnv.width = original_image.width;
        cnv.height = original_image.height;

        ctx = cnv.getContext('2d');

        ctx.drawImage(original_image, 0, 0, original_image.width, original_image.height);
        ctx.globalAlpha = .5;
        ctx.globalCompositeOperation = 'lighter';
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
    //stats.update();
  }

  function render() {
    renderer.render(scene, camera);
  }

  init() && animate();

  // Initialize the color picker
  init_color_picker();

})();
