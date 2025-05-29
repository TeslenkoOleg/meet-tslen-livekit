import {Component,} from '@angular/core';

import {RouterOutlet, } from "@angular/router";
import {WellcomeComponent} from "./wellcome/wellcome.component";

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [RouterOutlet, WellcomeComponent],
    templateUrl: './app.component.html',
    styleUrl: './app.component.css'
})
export class AppComponent {}
