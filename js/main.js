;(function(){

  var features = (function(){
    var canvas_elem = document.createElement('canvas');
    var canvas_support = !!canvas_elem.getContext('2d');

    return {
      canvas: canvas_support,
      canvastext: canvas_support && (canvas_elem.getContext('2d').fillText instanceof Function),
      webgl: !!window.WebGLRenderingContext
    }
  })();

  var container, stats, angle_info;
  var camera, scene, renderer;
  var group;
  var mouseX = 0, mouseY = 0;
  var isDragPossible = false, isOnDragg = false, dragOpts, isGlobeDragged = false;
  var DRAG_THESHOLD = 5;
  var ROTATION_STEP = 0.004;

  var windowHalfX = window.innerWidth / 2;
  var windowHalfY = window.innerHeight / 2;

  var texture_src = 'img/textures/dashboard_device_map.png';

  function init() {
    container = document.getElementById('container');
    scene = new THREE.Scene();
    group = new THREE.Group();

    scene.add(group);

    if (features.webgl) {
      renderer = new THREE.WebGLRenderer({
        antialias: true, // to get smoother output
        preserveDrawingBuffer: true // to allow screenshot
      });
    } else if (features.canvas) {
      renderer = new THREE.CanvasRenderer();
    } else {
      return false;
    }
    renderer.setClearColor(0xFFFCFB, 1);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);

    // Camera
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 10000 );
    camera.position.z = 500;
    camera.lookAt(scene.position);

    // Earth
    var geometry = new THREE.SphereGeometry(200, 32, 32);
    var material = new THREE.MeshBasicMaterial({
      map: THREE.ImageUtils.loadTexture(texture_src),
      overdraw: 0.5
    })
    var earthMesh  = new THREE.Mesh(geometry, material);

    group.add(earthMesh);

    container.appendChild(renderer.domElement);

    // Stats
    stats = new Stats();
    stats.domElement.style.position = 'absolute';
    stats.domElement.style.top = '0';
    container.appendChild( stats.domElement );

    angle_info = document.createElement('div');
    angle_info.style.position = 'absolute';
    angle_info.style.left = '100px';
    angle_info.style.top = '0';
    container.appendChild(angle_info);



    document.addEventListener('mousedown', onDocumentMouseDown, false);
    document.addEventListener('mousemove', onDocumentMouseMove, false);
    document.addEventListener('mouseup', onDocumentMouseUp, false);
    //renderer.domElement.addEventListener( 'mousemove', onDocumentMouseMove, false );

    //window.addEventListener('resize', onWindowResize, false);

    renderer.domElement.addEventListener('click', onDocumentClick, false);




    return true;
  }

  function onWindowResize() {
    windowHalfX = window.innerWidth / 2;
    windowHalfY = window.innerHeight / 2;

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  function onDocumentMouseDown(evt) {
    if (isDragPossible) {
      evt.preventDefault();
      isGlobeDragged = false;

      dragOpts = {
        x: evt.clientX - windowHalfX,
        y: evt.clientY - windowHalfY,
        rotation: {x: group.rotation.x, y: group.rotation.y}
      }
    }
  }

  function onDocumentMouseMove(evt) {
    mouseX = (evt.clientX - windowHalfX);
    mouseY = (evt.clientY - windowHalfY);

    checkIntersection(evt);

    if (dragOpts && ((Math.abs(mouseX - dragOpts.x) >= DRAG_THESHOLD) || (Math.abs(mouseY - dragOpts.y) >= DRAG_THESHOLD))) {
      isOnDragg = true;
      isGlobeDragged = true;
    }
  }

  function onDocumentMouseUp(evt) {
    isOnDragg = false;
    dragOpts = false;

    checkIntersection(evt);
  }

  function onDocumentClick(evt) {
    if (isGlobeDragged) {
      return;
    }

    // Not supported by all~!!!!!!!!!!!!!
    var canvasRect = renderer.domElement.getBoundingClientRect();
    var raycaster = new THREE.Raycaster();

    raycaster.ray.origin.set(0, 0, 0);
    camera.localToWorld(raycaster.ray.origin);

    raycaster.ray.direction.set(
        ((evt.clientX - canvasRect.left) / canvasRect.width) * 2 - 1,
        ((canvasRect.top - evt.clientY) / canvasRect.height) * 2 + 1,
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


        uv.y = 1 - uv.y;
        var color = getColorAt(uv);
        angle_info.textContent = 'Clicked on: ' + uv.x.toPrecision(3) + 'x' +  uv.y.toPrecision(3) + '; color is:' + color;
        angle_info.style.background = color;

        //console.info(uv);
        return;
    }
  }

  function getColorAt(pos) {
    var img = new Image();
    img.src = texture_src;
    var size = {w: 500, h: 500};

    var canvas = document.createElement('canvas');
    canvas.width = size.w;
    canvas.height = size.h;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, size.w, size.h);

    var pixel = ctx.getImageData(size.w * pos.x, size.h * pos.y, 1, 1);
    console.info(size.w * pos.x, size.h * pos.y)
    var data = pixel.data;
    var rgba = 'rgba(' + data[0] + ',' + data[1] + ',' + data[2] + ',' + data[3] + ')';
    return rgba;
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

  function animate() {
    requestAnimationFrame(animate);

    if (!isOnDragg) {
      /*
      group.rotation.y += ROTATION_STEP;
      camera.position.x += (mouseX - camera.position.x) * 0.05;
      camera.position.y += (- mouseY - camera.position.y) * 0.05;
      camera.lookAt(scene.position);

      // Reset the x rotation if no free move
      if (group.rotation.x !== 0) {
        var DOUBLE_PI = (Math.PI * 2);
        // Normalize angle
        if (Math.abs(group.rotation.x) > DOUBLE_PI) {
          group.rotation.x = group.rotation.x % DOUBLE_PI;
        }

        // Reset if angle is too small
        if (Math.abs(group.rotation.x) < ROTATION_STEP) {
          group.rotation.x = 0;
        }
        group.rotation.x += ROTATION_STEP * (group.rotation.x > 0 ? -1 : 1);
      }
      */
    } else {
      group.rotation.y = dragOpts.rotation.y + ((mouseX - dragOpts.x) * (ROTATION_STEP / 2));
      group.rotation.x = dragOpts.rotation.x + ((mouseY - dragOpts.y) * (ROTATION_STEP / 2));
    }

    render();
    stats.update();
  }

  function render() {
    renderer.render(scene, camera );
  }

  init() && animate();
})();
