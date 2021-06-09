import { assert } from "../../Utils/Assert.js";
import { EditorCommand } from "./Command.js";

export class DeleteCommand extends EditorCommand{
    block;
    generatedBy;

    parent;
    index;

    constructor(editor, block){
        super(editor, 'Delete');

        this.block = block;
        this.parent = block.GetParent();
        this.index = this.parent.IndexOf(block);

        let generatedBy = this.block.GetGeneratedBy();
        if (generatedBy && !generatedBy.GetSymbol().repeatable)
            this.generatedBy = generatedBy;

        this.selected = this.editor.selected;
    }

    Execute(){
        this.editor.RemoveElem_WithChecks(this.block);
    }

    Undo(){
        if (this.generatedBy)
            this.generatedBy.GetParent().RemoveElem(this.generatedBy);
        
        this.parent.InsertAtIndex(this.index, this.block);
        this.editor.RenderWorkspace();
        this.editor.Select(this.selected);
    }

    Redo(){
        this.Execute();
    }
}