'use strict';

// On the choice of parser:
// https://developer.mozilla.org/en-US/docs/Mozilla/Projects/SpiderMonkey/Parser_API
// Alternative to Recast: https://github.com/facebook/pfff
const Recast = require('recast');
const Builders = Recast.types.builders;

const {LINE_SEPARATOR} = require('./settings');
const RECAST_SETTINGS = { lineTerminator: LINE_SEPARATOR }

function get_lines(body_text) {
    // TODO figure out whether we need a better way than splitting on LINE_SEPARATOR
    return body_text.split(LINE_SEPARATOR);
}

function get_text(body_text, loc) {
    const start_line_no = loc.start.line;
    const end_line_no = loc.end.line;

    const start_char_idx = loc.start.column;
    const end_char_idx = loc.end.column;

    const code_lines = get_lines(body_text);
    const code_lines_subset = code_lines.slice(start_line_no - 1, end_line_no)
    const code_line = code_lines_subset.join(LINE_SEPARATOR)

    const slice_start_idx = start_char_idx;
    const slice_end_idx = code_line.length 
                            - (code_lines[end_line_no - 1].length - end_char_idx)

    const text = code_line.slice(slice_start_idx, slice_end_idx);
    return text;
}

function replace_text(body_string, loc, new_text) {
    const start_line_no = loc.start.line;
    const end_line_no = loc.end.line;

    const start_char_idx = loc.start.column;
    const end_char_idx = loc.end.column;

    const code_lines = get_lines(body_string);
    // Add back the line separators. Note this skips the last line.
    // TODO is this valid if the last line actually ends in a LINE_SEPARATOR?
    // Maybe the last line would actually be the empty string in that case.
    for (let i = 0; i < code_lines.length - 1; i++) {
        code_lines[i] = code_lines[i] + LINE_SEPARATOR;
    }
        
    const code_lines_subset = code_lines.slice(start_line_no - 1, end_line_no)
    let code_line = code_lines_subset.join();
    const slice_start_idx = start_char_idx;
    const slice_end_idx = code_line.length 
                            - (code_lines[end_line_no - 1].length - end_char_idx)

    const new_code_string = code_lines.slice(0, start_line_no - 1).join('')
                            + code_line.slice(0, start_char_idx) 
                                + new_text 
                                + code_line.slice(slice_end_idx)
                            + code_lines.slice(end_line_no).join('');

    return new_code_string;
}

function create_const_variable(code, variable_name) {
    // TODO validate variable_name?
    // TODO be more smart about where this is created

    let new_node = Builders.variableDeclaration("const", [
        Builders.variableDeclarator(
            Builders.identifier(variable_name), 
            Builders.literal(null)
        )
    ]);

    let AST = Recast.parse(code);

    const id_name = "MESH_ATTACHMENTS";
    AST = Recast.visit(AST, {
        visitVariableDeclarator: function (path) {
            if (path.node.id.name == id_name) {
                const attachment_node = path.parent.parent.get("body", path.parent.name);
                attachment_node.insertBefore(new_node);
                return false;
            }
            this.traverse(path);
        }
    });
    return Recast.print(AST, RECAST_SETTINGS).code;
}

function add_attachment(code, id, loc) {
    const new_attachment = `{id: \"${id}\", value: ${id}, loc: [${loc}]},`
    const new_code = append_array_element(code, "MESH_ATTACHMENTS", new_attachment);
    return new_code;
}

function remove_declaration(code, id_name) {
    let AST = Recast.parse(code, RECAST_SETTINGS);
    AST = Recast.visit(AST, {
        visitVariableDeclarator: function (path) {
            if (path.node.id.name == id_name) {
                path.prune();
                return false;
            }
            this.traverse(path);
        }
    });
    return Recast.print(AST, RECAST_SETTINGS).code;
}

function insert_array_element(code, id_name, element_num, inserted_text) {
    let AST = Recast.parse(code, RECAST_SETTINGS);
    AST = Recast.visit(AST, {
        visitVariableDeclarator: function (path) {
            if (path.node.id.name == id_name) {
                const arr_path = path.get('init');
                const elements_path = arr_path.get('elements');
                const inserted_node = Builders.identifier(inserted_text);
                if (elements_path.node.elements.length === 0) {
                    elements_path.push(inserted_node);
                } else {
                    elements_path.insertAt(element_num, inserted_node);
                }
                return false;
            }
            this.traverse(path);
        }
    });
    return Recast.print(AST, RECAST_SETTINGS).code;
}

function append_array_element(code, id_name, inserted_text) {
    let AST = Recast.parse(code, RECAST_SETTINGS);
    AST = Recast.visit(AST, {
        visitVariableDeclarator: function (path) {
            if (path.node.id.name == id_name) {
                const arr_path = path.get('init');
                const elements_path = arr_path.get('elements');
                const inserted_node = Builders.identifier(inserted_text);
                elements_path.push(inserted_node);
                return false;
            }
            this.traverse(path);
        }
    });
    return Recast.print(AST, RECAST_SETTINGS).code;
}

function remove_array_element(code, id_name, element_num) {
    let AST = Recast.parse(code, RECAST_SETTINGS);
    AST = Recast.visit(AST, {
        visitVariableDeclarator: function (path) {
            if (path.node.id.name == id_name) {
                const arr_path = path.get('init');
                const element_path = arr_path.get('elements', element_num);
                element_path.prune();
                return false;
            }
            this.traverse(path);
        }
    });
    return Recast.print(AST, RECAST_SETTINGS).code;
}

function insert_object_item(code, id_name, key_text, value_text) {
    // TODO throw error if duplicate key?
    let AST = Recast.parse(code, RECAST_SETTINGS);
    AST = Recast.visit(AST, {
        visitVariableDeclarator: function (path) {
            if (path.node.id.name == id_name) {
                const obj_path = path.get('init');
                const props_path = obj_path.get('properties');
                const new_prop_node = Builders.property('init', Builders.identifier(key_text), Builders.literal(value_text));
                props_path.push(new_prop_node);
                return false;
            }
            this.traverse(path);
        }
    });
    return Recast.print(AST, RECAST_SETTINGS).code;
}

function remove_object_item(code, id_name, key) {
    // TODO throw error if missing key?
    let AST = Recast.parse(code, RECAST_SETTINGS);
    AST = Recast.visit(AST, {
        visitVariableDeclarator: function (path) {
            if (path.node.id.name == id_name) {
                const obj_path = path.get('init');
                const props_path = obj_path.get('properties');
                if (props_path.value.length > 0) {
                    for (let i=0; i < props_path.value.length; i++) {
                        let prop_path = props_path.get(i);
                        let node_key = prop_path.node.key;
                        // console.log(prop_path.node);
                        if (
                            (node_key.type === "Literal" && node_key.value === key) 
                            || (node_key.type === "Identifier" && node_key.name === key)
                        ) {
                            prop_path.prune();
                            return false;
                        }
                    }
                }
            }
            this.traverse(path);
        }
    });
    return Recast.print(AST, RECAST_SETTINGS).code;
}

class AST {
    
    constructor(code_string) {
        this.tree = Recast.parse(code_string, RECAST_SETTINGS);
        this.program = this.tree.program;
        this.code_string = code_string;
    }

    get to_string() {
        return Recast.print(this.tree, RECAST_SETTINGS).code;
    }

    replace_text(loc, new_text) {
        const new_code_string = replace_text(this.code_string, loc, new_text);
        return new AST(new_code_string);
    }

    get_first_declaration_of_name(name_string) {
    // TODO throw error if duplicate key?
        let node_to_return;
        Recast.visit(this.tree, {
            visitVariableDeclarator: function (path) {
                if (path.node.id.name == name_string) {
                    node_to_return = path.node;
                    return false;
                }
                this.traverse(path);
            }
        });
        return node_to_return;
    }
    
}

module.exports = {
    get_text,
    replace_text,
    create_const_variable,
    add_attachment,
    remove_declaration,
    insert_array_element,
    append_array_element,
    remove_array_element,
    insert_object_item,
    remove_object_item,
    AST,
}
