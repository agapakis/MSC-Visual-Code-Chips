import { assert } from "../../Utils/Utils.js";
import { EditorElement, EditorElementTypes } from "../EditorElements/EditorElement.js";
import { Group } from "../EditorElements/Group.js";
import { InputBlock } from "../EditorElements/InputBlock.js";
import { NewLine } from "../EditorElements/NewLine.js";
import { SelectionBlock } from "../EditorElements/SelectionBlock.js";
import { SimpleBlock } from "../EditorElements/SimpleBlock.js";
import { TabBlock } from "../EditorElements/TabBlock.js";
import { MenuCategory } from "./MenuCategory.js";
import { EditorElementParser } from "../EditorElementParser.js"

export class Toolbox {
    categories = {};
    blocks = {};
    $scrollTargets = {};

    selectedCategory;

    $container;
    $toolbox;
    $toolboxMenu;
    $blockContainer;

    autoScrolling = false;

    /**
     * 
     * @param {[{name: string, icon: string, blocks: [EditorElement]}]} categories 
     */
    constructor($container, categories) {
        assert($container);

        if (categories){
            for (let category of categories){
                this.categories[category.name] = (new MenuCategory(category.name, category.icon, '#A5A5A5'));
                this.blocks[category.name] = category.blocks;
            }
        }

        this.$container = $container;
        this.InitializeView_();
    }
    
    InitializeView_(){
        this.$toolbox = $('<div/>').addClass('toolbox');
        this.$toolboxMenu = $('<div/>').addClass('toolbox-menu');
        this.$blockContainer = $('<div/>').addClass('toolbox-blocks');

        this.$toolbox.append(this.$toolboxMenu);
        this.$toolbox.append(this.$blockContainer);
        this.$container.append(this.$toolbox);

        this.SetupMenuSelectionOnScroll();
    }

    SetupMenuSelectionOnScroll() {
        this.$blockContainer.on('scroll', () => {
            if (!this.autoScrolling){
                let scrollTop = this.$blockContainer.scrollTop();
                let offsetTop = this.$blockContainer.offset().top;
                
                let closestCategory, min;
                for (let category in this.$scrollTargets){
                    let categoryY = this.$scrollTargets[category].offset().top + scrollTop - offsetTop - 20;
                    let offset = Math.ceil(scrollTop - categoryY);
                    if (min === undefined || (offset >= 0 && offset < min)){
                        closestCategory = category;
                        min = offset;
                    }
                }
                this.Select_(this.categories[closestCategory]);
            }
        });
    }

    RenderToolboxMenu(){
        for (let categoryName in this.categories) {
            let category = this.categories[categoryName];

            let $categoryContainer = $('<div/>').addClass('category-container');
            category.Render($categoryContainer);

            this.$toolboxMenu.append($categoryContainer);

            category.GetView().on('click', () => {
                this.Select_(category);
                this.autoScrolling = true;
                this.$blockContainer.animate(
                    {
                        scrollTop: this.$scrollTargets[categoryName].offset().top 
                                    + this.$blockContainer.scrollTop() 
                                    - this.$blockContainer.offset().top
                                    - 20
                    }, 
                    400, 
                    () => {
                        this.autoScrolling = false;
                    }
                )
            });
        }
    }

    RenderBlocks(){
        let scrollTop = this.$blockContainer.scrollTop();

        this.$blockContainer.empty();

        for (let categoryName in this.blocks){
            this.RenderCategoryBlocks_(categoryName);
        }

        this.$blockContainer.scrollTop(scrollTop);
    }

    Render() {
        this.RenderToolboxMenu();
        this.RenderBlocks();
    }

    RenderCategoryBlocks_(categoryName){
        let $wholeCategory = $('<div/>').addClass('category');
        let $scrollTarget = $('<div/>').html(categoryName).addClass('category-name');
        let $categoryBlocks = $('<div/>').addClass('category-blocks');
                    
        let blocks = this.blocks[categoryName];
        for (let b of blocks){
            b.Render($categoryBlocks);
        }

        $wholeCategory.append($scrollTarget, $categoryBlocks);
        this.$blockContainer.append($wholeCategory);

        this.$scrollTargets[categoryName] = $scrollTarget;
        
        this.SetUpDropEvents_($categoryBlocks, blocks);
    }

    SetUpDropEvents_($blocks, blocks){
        let $dropIndicator = $('<div/>').addClass('drop-indicator');

        let counter = 0;

        $blocks.on('dragenter', (e) => {
            e.preventDefault();
            counter++;
        });

        $blocks.on('dragleave', (e) => {
            if (--counter == 0)
                $dropIndicator.remove();
        });

        let blockBeforeInsertion;

        $blocks.on('dragover', (e) => {
            e.preventDefault();

            blockBeforeInsertion = undefined;
            let minOffset, $minOffsetBlockView;

            for (let b of blocks){
                let offset = b.GetWholeView().offset().top + b.GetWholeView().height() / 2 - e.clientY;
                if ( (minOffset === undefined && offset >= 0) || (offset !== undefined && offset < minOffset && offset >= 0) ){
                    minOffset = offset;
                    $minOffsetBlockView = b.GetWholeView();
                    blockBeforeInsertion = b;
                }
            }

            minOffset !== undefined ? $minOffsetBlockView.before($dropIndicator) : $blocks.append($dropIndicator);
        });

        $blocks.on('drop', (e) => {
            let blockStr = e.originalEvent.dataTransfer.getData('block');
            if (!blockStr)  return;
            
            let block = EditorElementParser.FromString( blockStr, (block) => this.BindToToolbox(block) );
            
            if (blockBeforeInsertion){
                blocks.splice(blocks.indexOf(blockBeforeInsertion), 0, block);    
            }else{
                blocks.push(block);
            }

            this.RenderBlocks();
        });
    }

    BindToToolbox(block){
        if (block.GetType() === EditorElementTypes.InputBlock || block.GetType() === EditorElementTypes.SelectionBlock){
            block.SetEditable(false);
        }

        block.SetTheme((elem) => {
            let type = elem.GetType();
            let styles = type;
            if (type != EditorElementTypes.NewLine && type != EditorElementTypes.Tab){
                styles += ` ${elem.GetSymbol().symbol.name}`;
            }
            return styles;
        });
    }

    Select_(category){
        this.selected?.SetColor('#A5A5A5');
        this.selected?.GetView()?.siblings().remove('.selected-line');
        
        category?.SetColor('#FAFAFA');
        category?.GetView()?.parent().append($('<div/>').addClass('selected-line'));

        this.selected = category;
    }

}