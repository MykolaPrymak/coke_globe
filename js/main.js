;$(document).ready(function(){
  // Shorthand for some math functions
  var abs = Math.abs, sin = Math.sin, cos=Math.cos, PI = Math.PI;

  // Feature detection
  var features = (function(){
    var canvasElem = document.createElement('canvas');
    var canvasSupport = !!canvasElem.getContext && canvasElem.getContext('2d');

    return {
      canvas: canvasSupport,
      webgl: canvasSupport && !!window.WebGLRenderingContext,
      isMobile: !!(navigator.userAgent.match(/Android|webOS|iPhone|iPad|iPod|BlackBerry|Windows Phone/i)),
      acceptTouch: !!(('ontouchstart' in window) || window.DocumentTouch && document instanceof DocumentTouch)
    }
  })();

  // Global configuration
  var config = {
    // Force to use the 2D fallback UI
    force2dFallback: false,
    // Enable/disable globe autorotation,
    autorotate: true,
    // Restore autorotate after globe spinup
    restoreAutorotate: true,
    // Max polar rotation angle. PI = 180 deg, PI/2 = 90 deg, PI /6 = 30 deg,
    maxPolarAngle: PI / 6,
    // Globe detail level
    details: 32,
    // Rotation speed on drag/spining. Lower value - slower rotation.
    rotationStep: 0.0045,
    // Minimum drag distance in px required to start dragging and not treat it as a click on globe
    dragTheshold: 5,
    // Inertia configuration
    inertia: {
      // Reduce to increase "massiveness" of the globe
      mass: 15,
      // 1-0 range. Lower the value - faster globe will stop
      dampening: {
        // Normal dampening value
        normal: 0.95,
        // dampening value if user clicks on the globe
        fast: 0.3
      },
      // Starting inertia threshold. Lower value - less movement required to start spinning.
      startTheshold: 0.07,
      // Lower spinning speed threshold when globe is stopped (and auto-rotation starts if enabled)
      stopTheshold: 0.004
    },
    // Main globe texture
    textureSrc: 'img/textures/dashboard-device-map-mobile_v2.jpg',
    // Texture with active regions
    regionTextureSrc: 'img/textures/dashboard-device-map-black-out_v2.png',
    regions: [
      {
        // Clickable color from active regions texture
        color: '#ff2122',
        // Arbitrary name to be displayed in the popup
        name: 'Corporate',
        // URL to open
        url: 'http://google.com/?q=north%20america',
        // PNG image with trasparency
        overlay: 'img/textures/dashboard-device-map-mobile-corp_v2.png',
        // Fallback UI coordinates
        mapCoord: [426,326,378,281,345,383,416,368,461,402,466,440,545,509,604,534,591,494,567,487,569,476,589,464,608,485,614,455,679,406,697,382,651,363,683,338,600,304,606,291,464,305,478,325,433,319]
      },
      {
        color: '#71dd4d',
        name: 'Latin America',
        url: 'http://google.com/?q=Mexico',
        overlay: 'img/textures/dashboard-device-map-mobile-la_v2.png',
        mapCoord: [629,513,618,527,618,540,604,565,620,599,645,616,626,706,640,734,661,704,668,686,716,647,733,626,755,576,718,553,695,529]
      },
      {
        color: '#e7f67d',
        name: 'Eurasian and Africa Group',
        url: 'http://google.com/?q=China',
        overlay: 'img/textures/dashboard-device-map-mobile-eag_v2.png',
        mapCoord: [1031,476,1049,542,1110,538,1125,622,1131,617,1145,672,1174,651,1187,658,1207,626,1250,630,1253,585,1225,626,1207,620,1244,531,1267,532,1274,518,1256,500,1296,462,1286,431,1291,418,1417,319,1477,375,1453,318,1534,367,1592,350,1585,385,1696,333,1613,321,1495,314,1456,307,1461,291,1330,317,1256,318,1264,331,1217,339,1230,367,1202,366,1188,395,1220,415,1175,411,1171,419,1194,433,1199,453,1181,448,1172,438,1172,446,1108,423,1091,440,1078,436]
      },
      {
        color: '#5d3ddd',
        name: 'Europe',
        url: 'http://google.com/?q=France',
        overlay: 'img/textures/dashboard-device-map-mobile-eur_v2.png',
        mapCoord: [1074,432,1056,406,1100,379,1083,375,1129,362,1109,347,1121,338,1122,318,1173,321,1190,310,1200,321,1230,327,1214,335,1230,365,1208,363,1167,431,1115,405]
      },
      {
        color: '#72a2ef',
        name: 'Asia Pacific Group',
        url: 'http://google.com/?q=kangaroo',
        overlay: 'img/textures/dashboard-device-map-mobile-apg_v2.png',
        mapCoord: [1418,321,1294,422,1294,447,1347,530,1373,491,1448,526,1450,541,1418,528,1403,542,1439,555,1418,564,1513,569,1504,591,1461,618,1475,664,1513,653,1534,674,1589,670,1588,658,1602,642,1555,586,1597,581,1562,546,1529,556,1585,578,1552,587,1550,606,1528,575,1526,596,1507,585,1514,566,1465,562,1457,546,1485,562,1491,522,1461,540,1447,521,1432,487,1498,457,1495,482,1514,486,1570,429,1502,479,1504,456,1513,451,1513,428,1526,430,1519,413,1556,382,1455,321,1483,393]
      }
    ],
    // Opacity of the active region texture mixin
    overlayOpacity: 1
  };

  // Tune values for mobile
  if (features.isMobile) {
    _.extend(config, {
      details: 16,
      rotationStep: 0.006,
      textureSrc: 'img/textures/dashboard-device-map-mobile_v2_1k.jpg'
    });
    config.inertia.mass= 50;
    config.inertia.dampening.normal = 0.9;
  }

  // Initial dampening value
  config.inertia.dampening.value = config.inertia.dampening.normal;

  // Global variable to store the current state
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
      startedOutside: false,
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
    canvasPos: null,
    selectedRegion: null,
    windowHalfX: getWindowInnerSize().width / 2,
    windowHalfY: getWindowInnerSize().height / 2,
    textureOriginalImg: null
  };

  var colorPicker = {
    img: null,
    cnv: null,
    ctx: null,
    size: {width: 512, height: 512}
  }

  // Renderer global variables
  var $container = $('#container'), stats, $angleInfo, $popup;
  var camera, scene, renderer;
  var group;

  // 3D engine initialization
  function init3d(globeTexture) {
    scene = new THREE.Scene();
    group = new THREE.Group();

    scene.add(group);

    // Clean container
    $container.html('');

    $angleInfo = $('<div />');
    $angleInfo.addClass('angle_info');
    $container.append($angleInfo);

    try {
     if (features.webgl) {
        renderer = new THREE.WebGLRenderer({
          antialias: !features.isMobile
        });
        $angleInfo.text('Using WegGL.');
      }
    } catch(e) {
      console.error('Fail to create WebGl render');
    }

    if (!renderer && features.canvas) {
      renderer = new THREE.CanvasRenderer();
      $angleInfo.text('Using Canvas.');
    } else if (!renderer) {
      $angleInfo.text('No supported render found');
      return false;
    }
    $angleInfo.text($angleInfo.text() + (features.isMobile ? ' On mobile' : ' On desktop'));

    THREE.ImageUtils.crossOrigin = "";
    renderer.setClearColor(0xFFFCFB, 1);
    renderer.setSize(status.windowHalfX * 2, status.windowHalfY * 2);
    if ('devicePixelRatio' in window) {
      renderer.setPixelRatio(window.devicePixelRatio);
    }

    // Camera
    camera = new THREE.PerspectiveCamera(60, (status.windowHalfX * 2) / (status.windowHalfY * 2), 1, 10000 );
    camera.position.z = (camera.aspect < 1) ? 600 : 500;
    camera.lookAt(scene.position);

    // Earth
    var geometry = new THREE.SphereGeometry(200, config.details, config.details);
    var material = new THREE.MeshBasicMaterial({
      color: '#FFFCFB',
      map: new THREE.Texture(globeTexture),
      overdraw: 0.5
    });
    material.map.needsUpdate = true;
    var earthMesh  = new THREE.Mesh(geometry, material);

    group.add(earthMesh);

    $container.append(renderer.domElement);

    // Stats
    stats = new Stats();
    stats.domElement.style.position = 'absolute';
    stats.domElement.style.top = '0';
    $container.append(stats.domElement);

    // Add event listeners
    $(window).on('resize', onWindowResize);

    if (!features.acceptTouch) {
      $(renderer.domElement).on('mousedown', onDocumentMouseDown)
                            .on('mousemove', onDocumentMouseMove)
                            .on('mouseup', onDocumentMouseUp)
                            .on('mouseleave', onDocumentMouseUp);
    } else {
      $(window).on('touchstart', onDocumentMouseDown)
               .on('touchmove', onDocumentMouseMove)
               .on('touchend', onDocumentMouseUp);

      $angleInfo.text($angleInfo.text() + ' Accept touches.');
    }
    $(renderer.domElement).click(onDocumentClick);

    // Get canvas position/size for use in detection func. Not supported by all~!!!!!!!!!!!!!
    status.canvasPos = getRenderClientRect();
    return true;
  }

  function onWindowResize() {
    var windowSize = getWindowInnerSize();
    status.windowHalfX = windowSize.width / 2;
    status.windowHalfY = windowSize.height / 2;

    if (features.canvas && camera) {
      camera.aspect = (status.windowHalfX * 2) / (status.windowHalfY * 2);
      camera.position.z = (camera.aspect < 1) ? 600 : 500;
      camera.updateProjectionMatrix();

      renderer.setSize(status.windowHalfX * 2, status.windowHalfY * 2);

      status.canvasPos = getRenderClientRect();
    }
  }

  function getRenderClientRect() {
    var $render = $(renderer.domElement);
    return _.extend($render.offset(), {width: $render.width(), height: $render.height()});
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
        status.drag.startedOutside = true;
      }
    }

    config.inertia.dampening.value = config.inertia.dampening.fast;
    config.autorotate = false;
  }

  function onDocumentMouseMove(evt) {
    evt.preventDefault();

    mixTouchToEvent(evt);
    status.mouseX = (evt.clientX - status.windowHalfX);
    status.mouseY = (evt.clientY - status.windowHalfY);

    status.drag.possible = true;

    if (status.drag.started && (
        (abs(status.mouseX - status.drag.opts.x) >= config.dragTheshold) ||
        (abs(status.mouseY - status.drag.opts.y) >= config.dragTheshold)
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

        status.impulse[axis] += abs(impulse) >= config.inertia.startTheshold ? impulse : 0;
      });

      // Disable spinning on x and z axes
      status.impulse.x = 0;
      status.impulse.z = 0;

      // Reset drag options
      _.extend(status.drag.opts, {x: 0, y: 0, rotation: {x: 0, y: 0, z: 0}});

      // Enable auto-rotation only if we have spinning globe
      config.autorotate = config.restoreAutorotate && (abs(status.impulse.y) >= config.inertia.startTheshold);
    }

    status.drag.active = false;
    status.drag.started = false;
    status.drag.startedOutside = false;
    //status.drag.possible = false;

    // Restore general dampening factor
    config.inertia.dampening.value = config.inertia.dampening.normal;
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
    var originalEvent = evt.originalEvent;
    if (features.acceptTouch &&  originalEvent.touches && (originalEvent.touches.length > 0)) {
      var touch = originalEvent.touches[0];
      evt.clientX = touch.clientX;
      evt.clientY = touch.clientY;
    }
  }

  function initColorPicker() {
    colorPicker.img = new Image();
    colorPicker.img.onload = function() {
      colorPicker.cnv = document.createElement('canvas');
      colorPicker.cnv.width = colorPicker.size.width;
      colorPicker.cnv.height = colorPicker.size.height;

      colorPicker.ctx = colorPicker.cnv.getContext('2d');
      colorPicker.ctx.drawImage(colorPicker.img, 0, 0, colorPicker.size.width, colorPicker.size.height);
    };
    colorPicker.img.src = config.regionTextureSrc;
  }

  function getColorAt(pos) {
    if (colorPicker.ctx) {
      var pixel = colorPicker.ctx.getImageData(colorPicker.size.width * pos.x, colorPicker.size.height * pos.y, 1, 1);

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
        ((x - status.canvasPos.left) / status.canvasPos.width) * 2 - 1,
        ((status.canvasPos.top - y) / status.canvasPos.height) * 2 + 1,
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
        if (!status.textureOriginalImg) {
          status.textureOriginalImg = globe.material.map.image;
        }
        if (!region.overlayCache) {
          var overlay = new Image();
          overlay.onload = function() {
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
      } else if (status.textureOriginalImg) {
        globe.material.map = new THREE.Texture(status.textureOriginalImg);
        globe.material.map.needsUpdate = true;
      }

      $container.css('cursor', (region ? 'pointer' : 'auto'));

      if (region) {
        //$angleInfo.text('Visit the ' + region.name + ' (' + region.url + ')');
      }
    }
    //$angleInfo.text('regionColor ' + regionColor);
  }

  function applyImageOverlay(globe, overlay) {
      var cnv = document.createElement('canvas');
      cnv.width = status.textureOriginalImg.width;
      cnv.height = status.textureOriginalImg.height;

      ctx = cnv.getContext('2d');

      // Draw original image
      ctx.drawImage(status.textureOriginalImg, 0, 0, status.textureOriginalImg.width, status.textureOriginalImg.height);

      // Mix with overlay
      ctx.globalAlpha = config.overlayOpacity;
      ctx.drawImage(overlay, 0, 0, overlay.width, overlay.height, 0, 0, status.textureOriginalImg.width, status.textureOriginalImg.height);

      // Put it back and request update
      globe.material.map = new THREE.Texture(cnv);

      globe.material.map.needsUpdate = true;

      return cnv;
  }

  function getRegionInfo(regionColor) {
    return _.find(config.regions, function(region) {return region.color === regionColor;});
  }

  function initPopup() {
    $popup = $('#popup');
    $popup.click(function() {
      $popup.hide();
    });
  }

  function showPopup(region) {
    $popup.html('<div class="overlay"></div><span><h1>' + region.name + '</h1><p>Region color: ' + region.color + '</p><p>Region URL: <a href="' + region.url + '" target="_blanck">' + region.url + '</a></p></span>');
    $popup.show();
  }

  function rotateGlobe() {
    if (!status.drag.active) {
      // Globe spinning
      _.each(status.impulse, function(impulse, axis) {
        if (impulse !== 0) {
          if (abs(impulse) > config.inertia.stopTheshold) {
            group.rotation[axis] += impulse;
            status.impulse[axis] *= config.inertia.dampening.value;
          } else {
            status.impulse[axis] = 0;
          }
        }
      });

      if (config.autorotate) {
        group.rotation.y += config.rotationStep / 2;
      }
    } else {
      var xShift = ((status.mouseY - status.drag.opts.y) * (config.rotationStep / 2));
      var yShift = ((status.mouseX - status.drag.opts.x) * (config.rotationStep / 2));
      var xAngle = status.drag.opts.rotation.x;
      var yAngle = status.drag.opts.rotation.y;
      var zAngle = status.drag.opts.rotation.z;

      group.rotation.x = xAngle + xShift; // Polar
      group.rotation.y = yAngle + (cos(xAngle) * yShift); // Equatorial
      //group.rotation.z = zAngle - (sin(xAngle) * yShift); // Azimutal

      // Max polar rotation
      if (group.rotation.x > config.maxPolarAngle) {
        group.rotation.x = config.maxPolarAngle;
      } else if (group.rotation.x < -config.maxPolarAngle) {
        group.rotation.x = -config.maxPolarAngle;
      }
    }
  }

  function animate() {
    requestAnimationFrame(animate);

    rotateGlobe();

    // Highlight country under the cursor
    if (!status.drag.startedOutside) {
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

  // Image MAP falback
  function initImageMap() {
    $('#falback_image_bk').attr('src', config.textureSrc);
    $('#falback_image').attr('src', config.textureSrc);

    precacheOverlays();

    $(window).on('resize', onWindowResize);
    $(window).on('resize', updateImageMap);
  }

  function updateImageMap() {
    var wWidth = status.windowHalfX * 2, wHeight = status.windowHalfY * 2;
    var mapOritinalWidth = 2048, mapOritinalHeight = 1024;
    var mapWidthScale = wWidth / mapOritinalWidth, mapHeightScale = wHeight / mapOritinalHeight;
    var $map = $('#falback_image_map');
    var $imgOverlayElement = $('#falback_image_overlay');
    var html = [];

    // Add new image map areas
    _.each(config.regions, function(region) {
      // Recalculate the image map area coords
      var coords = _.map(region.mapCoord, function(coord, idx) {
        if ((idx % 2) === 0) {
          return coord * mapWidthScale;
        } else {
          return coord * mapHeightScale;
        }
      });

      html.push('<area alt="'+region.name+'"title="'+region.name+'" href="'+region.url+'" target="_self" shape="poly" coords="'+coords.join(',')+'" />');
    });

    // Push new image map
    $map.html(html.join(''));

    // Append handlers
    var regionsElements = $map.children();
    _.each(config.regions, function(region, idx) {
      var $area = regionsElements.eq(idx);

        $area.on('mouseover', handleOnIMMouseOver(region, $imgOverlayElement))
           .on('mousemove', handleOnIMMouseOver(region, $imgOverlayElement))
           .on('mouseout', handleOnIMMouseOut($imgOverlayElement))
           .on('click', handleOnIMClick(region));
    });
  }

  function handleOnIMMouseOver(region, $imgOverlayElement) {
    return function() {
      $imgOverlayElement.attr('src', region.overlay).show();
    }
  }

  function handleOnIMMouseOut($imgOverlayElement) {
    return function() {
      $imgOverlayElement.attr('src', '').hide();
    }
  }

  function handleOnIMClick(region) {
    return function(evt) {
      evt.preventDefault();
      showPopup(region);
    }
  }

  function render() {
    renderer.render(scene, camera);
  }

  function getWindowInnerSize() {
    var width = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth;
    var height = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight;

    return {width: width, height: height};
  }

  //Polyfill
  if (!window.requestAnimationFrame) {
    window.requestAnimationFrame = (function(){
      return window.webkitRequestAnimationFrame ||
        window.mozRequestAnimationFrame    ||
        function( callback ){
          window.setTimeout(callback, 1000 / 60);
        };
    })();
  }

  function init() {
    // Initialization
    initPopup();

    // Preload main texture before start some UI
    var img = new Image();
    img.onload = function() {
      try {
        if (!config.force2dFallback && features.canvas && init3d(img)) {
          // If 3D globe initialization successfully the start animation and initialize the color picker
          animate();

          // Initialize the color picker
          initColorPicker();

          precacheOverlays();
        }
      } finally {
        if (!scene){
          // 3D fail - use 2D fallback
          initImageMap();
          updateImageMap();
        }
      }
      $('.loading').hide();
    };
    img.src = config.textureSrc;
  }

  // Start
  init();

});
