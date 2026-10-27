// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import Analysis from '../src/components/Analysis';
import type { ScenarioInput, WeatherSummary } from '../src/types';
afterEach(cleanup);
const summary:WeatherSummary={rain24Mm:0,liquidRain24Mm:0,maxWindKmh:10,maxGustKmh:20,minTempC:2,maxTempC:4,snowDepthM:0,positiveDegreeDays:3,validHours:24,stale:false};
function Navigation(){
 const [visible,setVisible]=useState(true),[saved,setSaved]=useState<ScenarioInput|undefined>();
 return <><button onClick={()=>setVisible(v=>!v)}>Switch section</button>{visible&&<Analysis summary={summary} gauges={null} initialInput={saved} onScenario={setSaved}/>}</>;
}
it('restores the edited catchment scenario when returning from another section',()=>{
 render(<Navigation/>);
 fireEvent.change(screen.getByLabelText(/^Drainage area/),{target:{value:'7'}});
 fireEvent.click(screen.getByRole('button',{name:'Switch section'}));
 fireEvent.click(screen.getByRole('button',{name:'Switch section'}));
 expect((screen.getByLabelText(/^Drainage area/) as HTMLInputElement).value).toBe('7');
});
