"use strict"

import b4w from "blend4web";

var m_app       = b4w.app;
var m_cfg       = b4w.config;
var m_data      = b4w.data;
var m_preloader = b4w.preloader;
var m_ver       = b4w.version;
var m_scenes    = b4w.scenes;
var m_ctl       = b4w.controls;
var m_cam       = b4w.camera;
var m_math      = b4w.math;
var m_vec3      = b4w.vec3;
var m_geom      = b4w.geometry;
var m_mat       = b4w.material;
var m_main      = b4w.main;
var m_trans     = b4w.transform;
var m_phys      = b4w.physics;
var m_tsr       = b4w.tsr;

var NONE = 0;
var CLICKED = 1;
var ROTATING = 2;
var MOVING = 3;

// Global state
var _gs = {
    to: new Float32Array(3),
    from: new Float32Array(3),
    source: new Float32Array(3),
    target: new Float32Array(3),
    speed: 10,
    interaction: NONE
};

var DEBUG = (m_ver.type() == "DEBUG");
var APP_ASSETS_PATH = m_cfg.get_std_assets_path() + "code_snippets/pathfinding/";
var _tsr = m_tsr.create();
var _tsr_inv = m_tsr.create();
var _vec3_tmp1 = new Float32Array(3);
var _vec3_tmp2 = new Float32Array(3);
var _vec3_tmp3 = new Float32Array(3);

export function init() {
    m_app.init({
        canvas_container_id: "main_canvas_container",
        callback: init_cb,
        show_fps: DEBUG,
        console_verbose: DEBUG,
        autoresize: true,
        debug_view: true,
        alpha: true,
        background_color: [1,1,1,0]
    });
}

function init_cb(canvas_elem, success) {
    if (!success) {
        console.log("b4w init failure");
        return;
    }
    m_preloader.create_preloader();
    canvas_elem.oncontextmenu = function(e) {
        e.preventDefault();
        e.stopPropagation();
        return false;
    };
    load();
}

function load() {
    m_data.load(APP_ASSETS_PATH + "pathfinding.json", load_cb, preloader_cb);
}

function preloader_cb(percentage) {
    m_preloader.update_preloader(percentage);
}

function find_path() {

    // convert positions into local space of navmesh_obj
    m_trans.get_tsr(_gs.navmesh_obj, _tsr);
    m_tsr.invert(_tsr, _tsr_inv);
    m_trans.get_translation(_gs.character_obj, _gs.source);
    m_tsr.transform_vec3(_gs.source, _tsr_inv, _vec3_tmp1);
    m_tsr.transform_vec3(_gs.target, _tsr_inv, _vec3_tmp2);
    console.time('get_island');
    var navmesh_island = m_phys.navmesh_get_island(_gs.navmesh_obj, _vec3_tmp1);
    console.timeEnd('get_island');
    console.time('find_path');
    var options = {
        "navmesh_island": navmesh_island
    }
    var path_info = m_phys.navmesh_find_path(_gs.navmesh_obj, _vec3_tmp1,
            _vec3_tmp2, options);
    console.timeEnd('find_path');
    if (!path_info || !path_info["positions"].length)
        return;
    var path = path_info["positions"];
    m_trans.set_translation_v(_gs.green_marker, _gs.source);
    m_trans.set_translation_v(_gs.red_marker, _gs.target);

    m_vec3.copy(_gs.target, _gs.source);
    var num_points = path.length;

    for (var i = 0; i < num_points; i++)
        m_tsr.transform_vectors(path, _tsr, path);

    _gs.path = path;
    _gs.current_path_point = 0;
}

var ray_callback = function(id, hit_fract, obj_hit, hit_time, hit_pos, hit_norm) {
    m_vec3.copy(hit_pos, _gs.target);
    find_path()
};

function start() {
    var target = m_trans.get_translation(_gs.red_marker, _vec3_tmp1);
    m_vec3.copy(target, _gs.target);
    find_path();
}

var click_sensor_cb = function(obj, id, pulse) {
    if (m_ctl.get_sensor_value(obj, id, 0) ||
            m_ctl.get_sensor_value(obj, id, 1))
        switch(_gs.interaction) {
        case NONE:
            _gs.interaction = CLICKED;
        case ROTATING:
            return;
        }
    else {
        var rotating = _gs.interaction == ROTATING;
        _gs.interaction = NONE;
        if (rotating)
            return;
    }

    var xy = m_ctl.get_sensor_payload(obj, id, 0).coords;
    if (xy[0] == 0 && xy[1] == 0 ) {
        var xy = m_ctl.get_sensor_payload(obj, id, 1).coords;
    }

    var pline = m_math.create_pline();
    var camera = m_scenes.get_active_camera()
    m_cam.calc_ray(camera, xy[0], xy[1], pline);
    m_math.get_pline_directional_vec(pline, _gs.to);
    m_vec3.scale(_gs.to, 2000, _gs.to);
    var id = m_phys.append_ray_test_ext(camera,  _gs.from, _gs.to, "raytest_mesh",
        ray_callback, true, false, true, true);
};

var move_sensor_cb = function() {
    if (_gs.interaction == CLICKED)
        _gs.interaction = ROTATING;
};

function move(elapsed) {
    m_vec3.set(_gs.path[3 * _gs.current_path_point],
            _gs.path[3 * _gs.current_path_point + 1],
            _gs.path[3 * _gs.current_path_point + 2], _vec3_tmp1)
    m_trans.get_translation(_gs.character_obj, _vec3_tmp2);
    m_vec3.subtract(_vec3_tmp1, _vec3_tmp2, _vec3_tmp3);
    var len = m_vec3.length(_vec3_tmp3);
    m_vec3.normalize(_vec3_tmp3, _vec3_tmp3);
    if (len > _gs.speed * elapsed) {
        m_vec3.scaleAndAdd(_vec3_tmp2, _vec3_tmp3, _gs.speed * elapsed, _vec3_tmp3);
        m_trans.set_translation_v(_gs.character_obj, _vec3_tmp3);
    } else {
        m_trans.set_translation_v(_gs.character_obj, _vec3_tmp1);
        _gs.current_path_point++;
    }
}

var elapsed_sensor_cb = function(obj, id, pulse) {
    if(_gs.path && (_gs.current_path_point * 3) < _gs.path.length) {
        var elapsed = m_ctl.get_sensor_value(obj, id, 0);
        move(elapsed);
    }
}

function create_sensors() {
    var mc_s = m_ctl.create_mouse_click_sensor();
    var tc_s = m_ctl.create_touch_click_sensor();
    m_ctl.create_sensor_manifold(_gs.navmesh_obj, "input_click", m_ctl.CT_TRIGGER,
        [mc_s, tc_s], m_ctl.default_OR_logic_fun, click_sensor_cb);

    var mv_s = m_ctl.create_mouse_move_sensor();
    var tv_s = m_ctl.create_touch_move_sensor();
    m_ctl.create_sensor_manifold(_gs.navmesh_obj, "input_move", m_ctl.CT_POSITIVE,
        [mv_s, tv_s], m_ctl.default_OR_logic_fun, move_sensor_cb);

    var e_s = m_ctl.create_elapsed_sensor();
    m_ctl.create_sensor_manifold(_gs.character_obj, "moving", m_ctl.CT_CONTINUOUS,
        [e_s], null, elapsed_sensor_cb);
}

function render_callback(delta, timeline) {
    var line = m_scenes.get_object_by_name("line");
    if (_gs.path) {
        m_geom.draw_line(line, _gs.path);
        m_mat.set_line_params(line, {
            color: new Float32Array([1.0, 1.0, 1.0, 1.0]),
            width: 8
        });
    }
}

function init_logic() {
    _gs.navmesh_obj = m_scenes.get_object_by_name("navmesh");
    _gs.character_obj = m_scenes.get_object_by_name("character");
    _gs.green_marker = m_scenes.get_object_by_name("green");
    _gs.red_marker = m_scenes.get_object_by_name("red");
    m_main.set_render_callback(render_callback);
    create_sensors();
    start();
}

function load_cb(data_id, success) {
    if (!success) {
        console.log("b4w load failure");
        return;
    }
    m_app.enable_camera_controls(false, false, false, null, true);
    init_logic();
}