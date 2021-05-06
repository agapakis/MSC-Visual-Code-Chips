
import { AliasedGrammarSymbol, Language} from '../Language.js'
import { assert } from "../Utils/Utils.js";

import { EditorElementTypes } from './EditorElements/EditorElement.js'
import { Group } from './EditorElements/Group.js'
import { InputBlock } from './EditorElements/InputBlock.js'
import { NewLine } from './EditorElements/NewLine.js'
import { SelectionBlock } from './EditorElements/SelectionBlock.js'
import { SimpleBlock } from './EditorElements/SimpleBlock.js'
import { TabBlock } from './EditorElements/TabBlock.js'
import { KeyboardEventManager } from '../Utils/KeyboardEventManager.js'
import { Toolbox } from './Toolbox/Toolbox.js';
import { EditorElementParser } from './EditorElementParser.js';

export class Editor {

    $container;
    $editor;
    $workspace;
    $toolboxspace;

    language;
    code;
    clipboard;
    selected;

    keyboardEventManager;
    elemForDropping;

    typeValidators = {
        INT : (text) => {
            return Number.isInteger(Number(text));
        },
        FLOAT: (text) => {
            return Number.isFinite(Number(text));
        },
        CHAR: (text) => {
            return text.length === 1;
        },
        STRING: (text) => {
            return true;
        },
        BOOL: (text) => {
            return text === 'true' || text === 'false';
        },
        IDENTIFIER: (text) => {
            let matched = /[_A-Za-z]+[_A-Za-z0-9]*/g.exec(text);
            return matched && matched[0] === text;
        }
    };

    constructor($container, language, toolboxInfo){
        this.$container = $container;
        this.language = language;

        this.InitializeCode_();
        this.InitializeView_();
        this.InitializeEvents_();

        this.toolbox = new Toolbox(this.$toolboxspace, toolboxInfo);

        this.SetWorkspace_DragAndDrop();
        this.Render();
    }

    InitializeCode_(){
        let startingSymbol = new AliasedGrammarSymbol(this.language.GetSymbol('program', false));

        this.code = new Group(
            startingSymbol,
            [this.CreateElem(startingSymbol)]
        );

        this.code.SetDraggable(false);
    }

    InitializeView_(){
        this.$workspace = $('<div/>').addClass('workspace');
        this.$toolboxspace = $('<div/>').addClass('toolboxspace');
        
        this.$editor = $('<div/>').addClass('editor');
        this.$editor.append(this.$toolboxspace, this.$workspace);

        this.$container.empty();
        this.$container.append(this.$editor);
    }

    InitializeEvents_(){
        const Keys = KeyboardEventManager.Keys;
        
        this.keyboardEventManager = new KeyboardEventManager(this.$workspace)
            .AddEventHandler( [Keys.UP],                () => this.EventHandler_NavigateUp_() )
            .AddEventHandler( [Keys.DOWN],              () => this.EventHandler_NavigateDown_() )
            .AddEventHandler( [Keys.LEFT],              () => this.EventHandler_NavigateLeft_() )
            .AddEventHandler( [Keys.RIGHT],             () => this.EventHandler_NavigateRight_() )
            .AddEventHandler( [Keys.ONE],               () => this.EventHandler_NavigateIn_() )
            .AddEventHandler( [Keys.TWO],               () => this.EventHandler_NavigateOut_() )
            .AddEventHandler( [Keys.BACKSPACE],         () => this.EventHandler_Backspace_() )
            .AddEventHandler( [Keys.DELETE],            () => this.EventHandler_Delete_() )
            .AddEventHandler( [Keys.ENTER],             () => this.EventHandler_NewLine_() )
            .AddEventHandler( [Keys.SHIFT, Keys.TAB],   () => this.EventHandler_Outdent_() )
            .AddEventHandler( [Keys.TAB],               () => this.EventHandler_Indent_() )
            .AddEventHandler( [Keys.CTRL, Keys.C],      () => this.EventHandler_Copy_() )
            .AddEventHandler( [Keys.CTRL, Keys.V],      () => this.EventHandler_Paste_() )
        ;
    }

    RemoveElem_WithChecks(elem){
        let group = elem?.GetParent();
        
        if (!group) return false;

        let generatedBy = elem.GetGeneratedBy();

        if (generatedBy && !generatedBy.GetSymbol().repeatable){
            group.InsertAfterElem(elem, generatedBy);
            this.Select(generatedBy);
        }

        if (
            generatedBy || 
            elem.GetType() === EditorElementTypes.Tab || 
            elem.GetType() === EditorElementTypes.NewLine
        ){
            if (elem === this.selected){
                this.NavigateRight() || this.NavigateOut() || (this.selected = undefined);
            }

            group.RemoveElem(elem);
            this.RenderWorkspace();
            return true;
        }

        return false;
    }

    Select(elem) {
        if (this.selected) {
            this.selected.GetCustomizableView()?.removeClass('selected');
        }
        elem?.GetCustomizableView()?.addClass('selected');
        this.selected = elem;
    }

    Render(){
        this.RenderWorkspace();
        this.toolbox.Render();
    }

    SetWorkspace_DragAndDrop() {
        this.toolbox.SetElem_OnDragStart((e, elem) => {
            this.elemForDropping = elem;
            this.HighlightValidPasteTargets(this.elemForDropping);
        });

        this.toolbox.SetElem_OnDragEnd((e, elem) => {
            this.RemoveHightlights();
        });

        this.toolbox.SetToolbox_OnDrop((e, elem) => {
            this.RemoveHightlights();
        });

        this.$workspace.on('dragover', (e) => {
            e.preventDefault();
        });
    }

    RenderWorkspace(){
        let scrollTop = this.$workspace.scrollTop()
        this.$workspace.empty();
        this.code.Render(this.$workspace);
        this.$workspace.append($('<div/>').addClass('fill'));
        this.$workspace.scrollTop(scrollTop);
        if (this.selected){
            this.Select(this.selected);
        }
    }

    BindElemToEditor_(elem){
        switch(elem.GetType()){
            case EditorElementTypes.InputBlock:
                this.SetInputBlock_OnInput_(elem);
                break;
            case EditorElementTypes.SelectionBlock:
                this.SetSelectionBlock_OnSelect_(elem);
                break;
            case EditorElementTypes.Tab:
                elem.SetDraggable(false);
                elem.SetDroppable(false);
                break;
        }

        if (elem.GetSymbol && elem.GetSymbol().repeatable){
            elem.SetDraggable(false);
        }
        
        this.SetElem_OnDrop(elem);
        this.SetElem_OnClick_(elem);
        this.SetElem_Theme_(elem);
    }

    SetElem_Theme_(elem){
        elem.SetTheme((elem) => {
            let type = elem.GetType();
            let styles = type;
            if (type != EditorElementTypes.NewLine && type != EditorElementTypes.Tab){
                styles += ` ${elem.GetSymbol().symbol.name}`;
            }
            return styles;
        });
    }

    SetElem_OnClick_(elem){
        elem.SetOnClick((elem) => {
            this.Select(elem);
        });
    }

    SetElem_OnDrop(elem){
        let pasteOn;

        elem.SetOnDragStart((e, elem) => {
            this.elemForDropping = elem;
            this.HighlightValidPasteTargets(this.elemForDropping);
        });

        elem.SetOnDragEnd((e, elem) => {
            this.RemoveHightlights();
        });

        elem.SetOnDragEnter((e, elem) => {
            if (this.FindCommonPredecessor(this.elemForDropping, elem)){
                this.Select(elem);
                pasteOn = elem;
            }
        });

        elem.SetOnDrop((e, elem) => {
            if (elem === pasteOn){
                let elemStr = e.originalEvent.dataTransfer.getData('block');
                if (!elemStr)   return;
                
                let droppedBlock = EditorElementParser.FromString( elemStr, elem => this.BindElemToEditor_(elem) );
                if (elem.GetType() !== EditorElementTypes.Tab && this.Paste(droppedBlock, elem)){
                    this.RenderWorkspace();
                    this.Select(droppedBlock);
                }
                e.stopPropagation();
            }
        });
    }

    SetSelectionBlock_OnSelect_(selectionBlock){
        selectionBlock.SetOnSelect((selectionBlock) => {
            let vc = this.CreateElem(selectionBlock.GetSelectedSymbol());
            vc.SetGeneratedBy(selectionBlock);

            selectionBlock.GetParent().InsertBeforeElem(selectionBlock, vc);

            if (!selectionBlock.GetSymbol().repeatable){
                selectionBlock.GetParent().RemoveElem(selectionBlock);
            }else{
                selectionBlock.GetParent().InsertBeforeElem(selectionBlock, this.CreateNewLine());
            }

            this.RenderWorkspace();
            this.Select(vc);
        });
    }

    SetInputBlock_OnInput_(inputBlock){
        inputBlock.SetOnInput((inputBlock) => {
            let symbol = this.language.GetSymbol(
                inputBlock.GetSymbol().symbol.name, 
                inputBlock.GetSymbol().symbol.isTerminal
            );
            let type = this.language.GetTerminalType(symbol);
            let isValid = this.typeValidators[type];
            
            let $input = inputBlock.GetInput(), text = $input.val();
            text === '' || isValid(text) ? $input.removeClass('invalid-input') : $input.addClass('invalid-input');

            if (inputBlock.GetSymbol().repeatable){
                /* create code for a non repeating version of the GrammarSymbol */
                let vc = inputBlock.Clone();
                vc.GetSymbol().repeatable = false;
                vc.SetGeneratedBy(inputBlock);

                /* simulate typing on the generated block and not on the repeatable block */
                vc.SetText(text);
                inputBlock.SetText(undefined);

                inputBlock.GetParent().InsertBeforeElem(inputBlock, vc);

                this.RenderWorkspace();
                this.Select(vc);

                vc.GetInput().focus();
            }
        });
    }

    CreateElem(aliasedSymbol){
        let symbol = this.language.GetSymbol(
            aliasedSymbol.symbol.name,
            aliasedSymbol.symbol.isTerminal
        );
        let productions = this.language.GetProductions(symbol);
        
        let elem;

        if (symbol.isTerminal){

            if (this.language.GetTerminalType(symbol) === Language.TerminalType.Static){
                elem = new SimpleBlock(aliasedSymbol);
            }else{
                elem = new InputBlock(aliasedSymbol);
            }
            
        }else{
            if (productions.length === 1){
        
                /*
                    if the symbol has only one production then skip it and create 
                    code for its production's right hand side symbols
                */
                let production = productions[0];
                let aliasedSymbols = production.GetRhs().GetSymbols();
                let elems = aliasedSymbols.map( (s) => this.CreateElem(s) );

                elem = elems.length === 1 ? elems[0] : new Group(aliasedSymbol, elems);
            
            }else{
    
                /*
                    if the symbol has more than 1 productions create a block for it
                    with its production right hand side symbols as alternative choices
                */
                let alternateSymbols = [];
                for (let production of productions){
                    let productionSymbols = production.GetRhs().GetSymbols();
                    assert(productionSymbols.length <= 1, 'Block with an alternative selection of more than 1 symbols');
                    alternateSymbols.push(productionSymbols[0]);
                }
                elem = new SelectionBlock(aliasedSymbol, alternateSymbols);

            }
        }

        this.BindElemToEditor_(elem);
        return elem;
    }

    CreateNewLine(){
        let nl = new NewLine();
        this.BindElemToEditor_(nl);
        return nl;
    }

    CreateTab(){
        let tab = new TabBlock();
        this.BindElemToEditor_(tab);
        return tab;
    }

    CopyToClipboard(elem){
        if (
            elem.GetSymbol && 
            !elem.GetSymbol().repeatable
        ){
            this.clipboard = elem.CloneRec();
        }
    }

    HighlightValidPasteTargets(source){
        this.code.ForEachRec((elem) => {
            if (this.FindCommonPredecessor(source, elem)){
                elem.GetCustomizableView().addClass('highlighted');
            }else{
                if (elem.GetType() !== EditorElementTypes.NewLine && elem.GetType() !== EditorElementTypes.Tab)
                    elem.GetCustomizableView().addClass('opaque');
            }
        });
    }

    RemoveHightlights(){
        this.$workspace.find('.highlighted').removeClass('highlighted');
        this.$workspace.find('.opaque').removeClass('opaque');
    }

    FindCommonPredecessor(elem1, elem2){
        if (!elem1.GetSymbol || !elem2.GetSymbol)
            return null;

        for (let iter1 = elem1; iter1; iter1 = iter1.GetGeneratedBy()){
            for (let iter2 = elem2; iter2; iter2 = iter2.GetGeneratedBy()){
                let symbol1 = iter1.GetSymbol().symbol, symbol2 = iter2.GetSymbol().symbol;
                if (symbol1.name === symbol2.name && symbol1.isTerminal === symbol2.isTerminal){
                    return { elem1: iter1, elem2: iter2 };
                }
            }
        }
        return null;
    }

    Paste(source, dest){
        let preds = this.FindCommonPredecessor(source, dest);
        if (!preds) return false;

        let {elem1: sourcePoint, elem2: destPoint} = preds;
        
        for (var destRoot = destPoint; destRoot; destRoot = destRoot.generatedBy);

        if (destPoint.GetSymbol().repeatable && !source.GetSymbol().repeatable){
            /* The repeatable block gets created again to allow further repetitions */
            if (destPoint === dest){
                dest.GetParent().InsertAfterElem(dest, dest.CloneRec());
    
                if (!destPoint.GetSymbol().symbol.isTerminal)
                    dest.GetParent().InsertAfterElem(dest, this.CreateNewLine());
            }

            /* The pasted block (or descendants) has to maintain repeatability, so that it is deletable */
            if (destPoint.GetSymbol().symbol.isTerminal) {
                sourcePoint.SetGeneratedBy(destPoint);
            }else
                sourcePoint.GetSymbol().repeatable = true;
        }else
            sourcePoint.SetGeneratedBy(destPoint.GetGeneratedBy());

        sourcePoint.GetSymbol().alias = destPoint.GetSymbol().alias;
        dest.GetParent().InsertBeforeElem(dest, source);
        dest.GetParent().RemoveElem(dest);

        return true;
    }

    NavigateIn() {
        if (this.selected && this.selected.GetType() === EditorElementTypes.Group){
            this.Select(this.selected.GetElem(0));
            return true;
        }
        return false;
    }

    NavigateOut() {
        let parent = this.selected?.GetParent();
        if (parent){
            this.Select(parent);
            return true;
        }
        return false;
    }

    NavigateLeft() {
        if (this.selected && this.selected.GetParent()){
            let parent = this.selected.GetParent();
            assert(parent.GetType() === EditorElementTypes.Group);
            
            for (let i = parent.IndexOf(this.selected) - 1; i >= 0; --i){
                if (parent.GetElem(i).GetType() != EditorElementTypes.NewLine){
                    this.Select(parent.GetElem(i));
                    return true;
                }
            }
        }
        return false;
    }

    NavigateRight() {
        if (this.selected && this.selected.GetParent()){
            let parent = this.selected.GetParent();
            assert(parent.GetType() === EditorElementTypes.Group);

            for (let i = parent.IndexOf(this.selected) + 1; i < parent.GetLength(); ++i){
                if (parent.GetElem(i).GetType() != EditorElementTypes.NewLine){
                    this.Select(parent.GetElem(i));
                    return true;
                }
            }
        }
        return false;
    }

    NavigateUp() {
        let parent = this.selected?.GetParent();
        if (parent){
            assert(parent.GetType() === EditorElementTypes.Group);
            
            for (let i = parent.IndexOf(this.selected); i > 0; --i){
                if (
                    parent.GetElem(i).GetType() === EditorElementTypes.NewLine && 
                    parent.GetElem(i - 1).GetType() !== EditorElementTypes.NewLine
                ){
                    this.Select(parent.GetElem(i - 1));
                    return true;
                }
            }
        }
        return false;
    }

    NavigateDown() {
        if (this.selected && this.selected.GetParent()){
            let parent = this.selected.GetParent();
            assert(parent.GetType() === EditorElementTypes.Group);
            
            for (let i = parent.IndexOf(this.selected); i < parent.GetLength() - 1; ++i){
                if (
                    parent.GetElem(i).GetType() === EditorElementTypes.NewLine && 
                    parent.GetElem(i + 1).GetType() !== EditorElementTypes.NewLine
                ){
                    this.Select(parent.GetElem(i + 1));
                    return true;
                }
            }
        }
        return false;
    }

    EventHandler_NavigateUp_(){
        this.NavigateUp();
    }

    EventHandler_NavigateDown_(){
        this.NavigateDown();
    }

    EventHandler_NavigateLeft_(){
        this.NavigateLeft();
    }

    EventHandler_NavigateRight_(){
        this.NavigateRight();
    }

    EventHandler_NavigateIn_(){
        this.NavigateIn();
    }

    EventHandler_NavigateOut_(){
        this.NavigateOut();
    }

    EventHandler_Delete_(){
        this.RemoveElem_WithChecks(this.selected);
    }

    EventHandler_Backspace_(){
        this.RemoveElem_WithChecks(this.selected.GetParent().GetPreviousElem(this.selected));
    }

    EventHandler_Indent_(){
        if (this.selected && this.selected.GetParent()){
            this.selected.GetParent().InsertBeforeElem(this.selected, this.CreateTab());
            this.RenderWorkspace();
        }
    }

    EventHandler_Outdent_(){
        if (this.selected && this.selected.GetParent()){
            let previous = this.selected.GetParent().GetPreviousElem(this.selected);
            if (previous.type === EditorElementTypes.Tab){
                this.selected.GetParent().RemoveElem(previous);
                this.RenderWorkspace();
            }
        }
    }

    EventHandler_NewLine_(){
        if (this.selected && this.selected.GetParent()){
            this.selected.GetParent().InsertBeforeElem(this.selected, this.CreateNewLine());
            this.RenderWorkspace();
        }
    }

    EventHandler_Copy_(){
        if (this.selected){
            this.CopyToClipboard(this.selected);
        }
    }

    EventHandler_Paste_(){
        if (
            this.clipboard 
            && this.selected?.GetType() !== EditorElementTypes.Tab
        ){
            let source = this.clipboard.CloneRec(), dest = this.selected;
            if (this.Paste(source, dest)){
                this.RenderWorkspace();
                this.Select(source);
            }
        }
    }
}