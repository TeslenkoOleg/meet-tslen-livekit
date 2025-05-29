import {Routes} from "@angular/router";
import {WellcomeComponent} from "./wellcome/wellcome.component";

export const routes: Routes = [
  {
    path: ':id', component: WellcomeComponent,
  },
    {
        path: '', component: WellcomeComponent
    }
];
